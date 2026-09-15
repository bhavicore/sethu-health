import { Router } from 'express';
import { db, logAudit, listAudit } from '../db.js';
import { expandAbbreviations, parseMedicationLines } from '../clinical/normalize.js';
import { runClinicalChecks } from '../clinical/rules.js';
import { summarizeHistory, currentMedicationsFromHistory } from '../clinical/summary.js';
import { buildDoseScheduleBlock, WARNING_SIGNS_TEXT, DEFAULT_ADVICE_NOTE } from '../clinical/templates.js';
import { rewordAdviceForPatient, geminiConfigured } from '../lib/gemini.js';
import { transcribeAudio, synthesizeSpeech, sarvamConfigured } from '../lib/sarvam.js';
import { queueWhatsappMessage } from '../lib/whatsapp.js';
import { listInventory, computeReorder } from '../clinical/inventory.js';
import { draftIndentJustification } from '../lib/gemini.js';

export const careRouter = Router();

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function serializePatient(row) {
  if (!row) return null;
  const { allergies, chronic_conditions, whatsapp_consent, ...rest } = row;
  return {
    ...rest,
    allergies: JSON.parse(allergies || '[]'),
    chronicConditions: JSON.parse(chronic_conditions || '[]'),
    whatsappConsent: Boolean(whatsapp_consent),
  };
}

function serializeEncounter(row) {
  if (!row) return null;
  const { vitals, medications, warnings, override_reasons, ...rest } = row;
  return {
    ...rest,
    vitals: JSON.parse(vitals || '{}'),
    medications: JSON.parse(medications || '[]'),
    warnings: JSON.parse(warnings || '[]'),
    overrideReasons: JSON.parse(override_reasons || '[]'),
  };
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------
careRouter.get('/facilities', (req, res) => {
  res.json({ facilities: db.prepare('SELECT * FROM facilities').all() });
});

careRouter.get('/medicines', (req, res) => {
  res.json({ medicines: db.prepare('SELECT * FROM medicines ORDER BY generic_name').all() });
});

careRouter.get('/config', (req, res) => {
  res.json({ geminiConfigured: geminiConfigured(), sarvamConfigured: sarvamConfigured() });
});

// ---------------------------------------------------------------------------
// Patients — registration & lookup (Task 3.1)
// ---------------------------------------------------------------------------
careRouter.post('/patients/register', (req, res) => {
  const { name, age, gender, phone, language, messageFormat, allergies, chronicConditions } = req.body || {};
  if (!name?.trim() || !age || !phone?.trim()) {
    return res.status(400).json({ error: 'name, age, and phone are required.' });
  }
  const existing = db.prepare('SELECT id FROM patients WHERE phone = ?').get(phone.trim());
  if (existing) return res.status(409).json({ error: 'A patient with this phone number already exists.', patientId: existing.id });

  const id = makeId('pat');
  db.prepare(`
    INSERT INTO patients (id, name, age, gender, phone, language, message_format, whatsapp_consent, allergies, chronic_conditions)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, name.trim(), age, gender || null, phone.trim(), language || 'hi', messageFormat || 'text',
    JSON.stringify(allergies || []), JSON.stringify(chronicConditions || []));

  logAudit(req.body.actor || 'desk', 'register', 'patient', id, { name, phone });
  res.status(201).json({ patient: serializePatient(db.prepare('SELECT * FROM patients WHERE id = ?').get(id)) });
});

careRouter.get('/patients/lookup', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone query param required' });
  const row = db.prepare('SELECT * FROM patients WHERE phone = ?').get(String(phone).trim());
  if (!row) return res.status(404).json({ error: 'No patient found for this phone number.' });
  res.json({ patient: serializePatient(row) });
});

// Simulates the WhatsApp QR scan at the desk: patient sends the pre-filled
// "Hi", which opens Meta's 24-hour window and records messaging consent.
careRouter.post('/patients/:id/whatsapp-consent', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  db.prepare("UPDATE patients SET whatsapp_consent = 1, whatsapp_window_opened_at = datetime('now') WHERE id = ?").run(req.params.id);
  logAudit('desk', 'whatsapp-consent', 'patient', req.params.id, {});
  res.json({ patient: serializePatient(db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id)) });
});

careRouter.get('/patients/:id/history', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  const encounters = db
    .prepare('SELECT * FROM encounters WHERE patient_id = ? AND status = ? ORDER BY created_at DESC')
    .all(req.params.id, 'approved');
  res.json({
    patient: serializePatient(patient),
    encounters: encounters.map(serializeEncounter),
    summary: summarizeHistory(patient, encounters),
    currentMedications: currentMedicationsFromHistory(encounters),
  });
});

// ---------------------------------------------------------------------------
// Speech-to-text (Task 2.1) — optional, falls back to manual typing
// ---------------------------------------------------------------------------
careRouter.post('/stt', async (req, res) => {
  const { audioBase64, mimeType, language } = req.body || {};
  if (!audioBase64) return res.status(400).json({ error: 'audioBase64 required' });
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const result = await transcribeAudio({ audioBuffer, mimeType, language });
  res.json(result);
});

// ---------------------------------------------------------------------------
// Encounters (Task 3.1 + 3.2 alerts)
// ---------------------------------------------------------------------------

/** Normalize + structure + run CDSS checks, without persisting anything yet. */
careRouter.post('/encounters/draft', (req, res) => {
  const { patientId, facilityId, chiefComplaint, diagnosis, medicationLines, dictationLang } = req.body || {};
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const medications = parseMedicationLines(medicationLines || '');
  const normalizedComplaint = expandAbbreviations(chiefComplaint || '');
  const normalizedDiagnosis = expandAbbreviations(diagnosis || '');
  const patientAllergies = JSON.parse(patient.allergies || '[]');

  const warnings = runClinicalChecks({ medications, patientAllergies, facilityId });

  res.json({
    patientId,
    facilityId,
    dictationLang: dictationLang || 'en',
    chiefComplaint,
    diagnosis,
    normalizedComplaint,
    normalizedDiagnosis,
    medications,
    warnings,
  });
});

/** Doctor clicks Approve: persist, deduct stock, generate patient advice, queue WhatsApp, log everything. */
careRouter.post('/encounters/approve', async (req, res) => {
  const {
    patientId, facilityId, doctorName, doctorRegNo, chiefComplaint, dictationRaw, dictationLang,
    diagnosis, medications, vitals, warnings, overrideReasons, adviceNotes, approvedBy,
  } = req.body || {};

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  if (!doctorName?.trim()) return res.status(400).json({ error: 'doctorName is required — the doctor signs every report.' });

  const normalizedText = expandAbbreviations(`${chiefComplaint || ''}. ${diagnosis || ''}`.trim());

  // Build the doctor-approved English instructions: doctor's own advice note
  // (or the default) plus the standard, pre-approved warning-signs sentence —
  // never anything invented at send-time.
  const englishInstructions = `${adviceNotes?.trim() || DEFAULT_ADVICE_NOTE} ${WARNING_SIGNS_TEXT.en}`;
  const reword = await rewordAdviceForPatient({ englishInstructions, language: patient.language });

  const doseScheduleEn = buildDoseScheduleBlock(medications || [], 'en');
  const doseSchedulePatientLang = buildDoseScheduleBlock(medications || [], patient.language);

  const insert = db.prepare(`
    INSERT INTO encounters (
      patient_id, facility_id, doctor_name, doctor_reg_no, chief_complaint, dictation_raw, dictation_lang,
      normalized_text, vitals, diagnosis, medications, warnings, override_reasons,
      advice_english, advice_patient_lang, status, approved_at, approved_by
    ) VALUES (
      @patient_id, @facility_id, @doctor_name, @doctor_reg_no, @chief_complaint, @dictation_raw, @dictation_lang,
      @normalized_text, @vitals, @diagnosis, @medications, @warnings, @override_reasons,
      @advice_english, @advice_patient_lang, 'approved', datetime('now'), @approved_by
    )
  `);
  const result = insert.run({
    patient_id: patientId,
    facility_id: facilityId,
    doctor_name: doctorName,
    doctor_reg_no: doctorRegNo || null,
    chief_complaint: chiefComplaint || null,
    dictation_raw: dictationRaw || null,
    dictation_lang: dictationLang || 'en',
    normalized_text: normalizedText,
    vitals: JSON.stringify(vitals || {}),
    diagnosis: diagnosis || null,
    medications: JSON.stringify(medications || []),
    warnings: JSON.stringify(warnings || []),
    override_reasons: JSON.stringify(overrideReasons || []),
    advice_english: `${englishInstructions}\n\nDose schedule:\n${doseScheduleEn}`,
    advice_patient_lang: `${reword.patientLanguageText}\n\n${doseSchedulePatientLang}`,
    approved_by: approvedBy || doctorName,
  });
  const encounterId = result.lastInsertRowid;

  logAudit(approvedBy || doctorName, 'approve', 'encounter', encounterId, {
    warnings, overrideReasons, geminiUsed: !reword.mock,
  });

  // Deduct stock (FIFO by expiry) and log today's usage, for every matched medicine.
  const today = new Date().toISOString().slice(0, 10);
  for (const med of medications || []) {
    if (!med.generic || !med.durationDays || !med.timesPerDay) continue;
    let qtyToDeduct = med.durationDays * med.timesPerDay;

    const batches = db
      .prepare('SELECT * FROM inventory WHERE facility_id = ? AND medicine_id = ? ORDER BY expiry_date ASC')
      .all(facilityId, med.generic);
    for (const batch of batches) {
      if (qtyToDeduct <= 0) break;
      const take = Math.min(batch.stock_qty, qtyToDeduct);
      if (take <= 0) continue;
      db.prepare("UPDATE inventory SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?").run(take, batch.id);
      qtyToDeduct -= take;
    }

    db.prepare(`
      INSERT INTO usage_history (facility_id, medicine_id, date, qty_used) VALUES (?, ?, ?, ?)
      ON CONFLICT(facility_id, medicine_id, date) DO UPDATE SET qty_used = qty_used + excluded.qty_used
    `).run(facilityId, med.generic, today, med.durationDays * med.timesPerDay);
  }

  // Queue the WhatsApp message for voice/both-preference patients who scanned the QR.
  let whatsappResult = null;
  if (patient.whatsapp_consent && (patient.message_format === 'voice' || patient.message_format === 'both')) {
    const tts = await synthesizeSpeech({ text: reword.patientLanguageText, language: patient.language });
    whatsappResult = await queueWhatsappMessage({
      patientId,
      encounterId,
      kind: 'voice',
      text: `${reword.patientLanguageText}\n\n${doseSchedulePatientLang}`,
      audioBase64: tts.audioBase64,
    });
    logAudit(approvedBy || doctorName, 'whatsapp-queue', 'encounter', encounterId, { ttsMock: tts.mock });
  }

  const savedEncounter = serializeEncounter(db.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId));
  res.status(201).json({
    encounter: savedEncounter,
    translation: reword,
    whatsapp: whatsappResult,
  });
});

careRouter.get('/encounters/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Encounter not found.' });
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(row.patient_id);
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(row.facility_id);
  res.json({ encounter: serializeEncounter(row), patient: serializePatient(patient), facility });
});

// ---------------------------------------------------------------------------
// Inventory & indents (Task 4.2)
// ---------------------------------------------------------------------------
careRouter.get('/inventory/:facilityId', (req, res) => {
  res.json({ facilityId: req.params.facilityId, inventory: listInventory(req.params.facilityId) });
});

careRouter.post('/inventory/:facilityId/indents/draft', async (req, res) => {
  const { medicineId } = req.body || {};
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.facilityId);
  const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId);
  if (!facility || !medicine) return res.status(404).json({ error: 'Facility or medicine not found.' });
  if (!facility.parent_id) return res.status(400).json({ error: 'This facility has no parent facility to indent to.' });

  const reorder = computeReorder(req.params.facilityId, medicineId);
  const justification = await draftIndentJustification({
    medicineName: medicine.generic_name,
    daysOfStockLeft: reorder.daysOfStockLeft,
    avg7: reorder.avg7,
    avg90: reorder.avg90,
    surgeFlag: reorder.surgeFlag,
    adjustedDailyUse: reorder.adjustedDailyUse,
    indentQty: reorder.indentQty,
    hasNearExpiry: reorder.hasNearExpiry,
  });

  res.json({
    fromFacility: req.params.facilityId,
    toFacility: facility.parent_id,
    medicineId,
    qty: reorder.indentQty,
    surgeFlag: reorder.surgeFlag,
    hasNearExpiry: reorder.hasNearExpiry,
    reorder,
    justification: justification.text,
    justificationMock: justification.mock,
  });
});

careRouter.post('/indents', (req, res) => {
  const { fromFacility, toFacility, medicineId, qty, justification, surgeFlag, nearExpiryNote } = req.body || {};
  if (!fromFacility || !toFacility || !medicineId || !qty) {
    return res.status(400).json({ error: 'fromFacility, toFacility, medicineId, qty are required.' });
  }
  const result = db.prepare(`
    INSERT INTO indents (from_facility, to_facility, medicine_id, qty, justification, surge_flag, near_expiry_note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(fromFacility, toFacility, medicineId, qty, justification || null, surgeFlag ? 1 : 0, nearExpiryNote || null);
  logAudit('agent', 'draft', 'indent', result.lastInsertRowid, { medicineId, qty });
  res.status(201).json({ indent: db.prepare('SELECT * FROM indents WHERE id = ?').get(result.lastInsertRowid) });
});

careRouter.get('/indents', (req, res) => {
  const { facility, direction = 'outgoing', status } = req.query;
  let rows;
  if (facility && direction === 'incoming') {
    rows = status
      ? db.prepare('SELECT * FROM indents WHERE to_facility = ? AND status = ? ORDER BY id DESC').all(facility, status)
      : db.prepare('SELECT * FROM indents WHERE to_facility = ? ORDER BY id DESC').all(facility);
  } else if (facility) {
    rows = status
      ? db.prepare('SELECT * FROM indents WHERE from_facility = ? AND status = ? ORDER BY id DESC').all(facility, status)
      : db.prepare('SELECT * FROM indents WHERE from_facility = ? ORDER BY id DESC').all(facility);
  } else {
    rows = db.prepare('SELECT * FROM indents ORDER BY id DESC').all();
  }
  const medicines = new Map(db.prepare('SELECT * FROM medicines').all().map((m) => [m.id, m]));
  res.json({ indents: rows.map((r) => ({ ...r, medicine: medicines.get(r.medicine_id) })) });
});

careRouter.post('/indents/:id/approve', (req, res) => {
  const { approvedBy, qty } = req.body || {};
  const indent = db.prepare('SELECT * FROM indents WHERE id = ?').get(req.params.id);
  if (!indent) return res.status(404).json({ error: 'Indent not found.' });
  db.prepare("UPDATE indents SET status = 'approved', approved_by = ?, approved_at = datetime('now'), qty = ? WHERE id = ?")
    .run(approvedBy || 'Medical Officer', qty || indent.qty, req.params.id);
  logAudit(approvedBy || 'Medical Officer', 'approve', 'indent', req.params.id, { qty: qty || indent.qty });
  // "Sent" — appears in the CHC's inbox (no real transport in this build).
  db.prepare("UPDATE indents SET status = 'sent' WHERE id = ?").run(req.params.id);
  res.json({ indent: db.prepare('SELECT * FROM indents WHERE id = ?').get(req.params.id) });
});

careRouter.post('/indents/:id/reject', (req, res) => {
  const { reason } = req.body || {};
  const indent = db.prepare('SELECT * FROM indents WHERE id = ?').get(req.params.id);
  if (!indent) return res.status(404).json({ error: 'Indent not found.' });
  db.prepare("UPDATE indents SET status = 'rejected' WHERE id = ?").run(req.params.id);
  logAudit('Medical Officer', 'reject', 'indent', req.params.id, { reason });
  res.json({ indent: db.prepare('SELECT * FROM indents WHERE id = ?').get(req.params.id) });
});

// ---------------------------------------------------------------------------
// Audit trail (Doctor-in-Control Rule 7 — everything is logged)
// ---------------------------------------------------------------------------
careRouter.get('/audit', (req, res) => {
  const limit = Number(req.query.limit) || 200;
  res.json({ entries: listAudit({ entity: req.query.entity, entityId: req.query.entityId, limit }) });
});
