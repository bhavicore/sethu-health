import { db } from './db.js';

// ---------------------------------------------------------------------------
// Synthetic demo data only — see task.md "Data We Need (demo)".
// Nothing here is a real patient, doctor, or facility. Interaction/allergy/dose
// tables are small hand-picked references for the prototype and are NOT a
// substitute for a pharmacist-reviewed clinical database.
// ---------------------------------------------------------------------------

function isSeeded() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM facilities").get();
  return row.n > 0;
}

function seedFacilities() {
  const insert = db.prepare('INSERT INTO facilities (id, name, type, parent_id) VALUES (?, ?, ?, ?)');
  insert.run('chc-1', 'Erode Community Health Centre', 'chc', null);
  insert.run('phc-1', 'Kaveripatnam Primary Health Centre', 'phc', 'chc-1');
}

const MEDICINES = [
  { id: 'paracetamol', generic_name: 'Paracetamol', unit_label: '500 mg tablet', max_daily_dose_mg: 4000, nlem_code: 'NLEM-A01' },
  { id: 'ors', generic_name: 'Oral Rehydration Salts', unit_label: '21 g sachet', max_daily_dose_mg: null, nlem_code: 'NLEM-A02' },
  { id: 'amoxicillin', generic_name: 'Amoxicillin', unit_label: '500 mg capsule', max_daily_dose_mg: 3000, nlem_code: 'NLEM-A03' },
  { id: 'metformin', generic_name: 'Metformin', unit_label: '500 mg tablet', max_daily_dose_mg: 2000, nlem_code: 'NLEM-A04' },
  { id: 'amlodipine', generic_name: 'Amlodipine', unit_label: '5 mg tablet', max_daily_dose_mg: 10, nlem_code: 'NLEM-A05' },
  { id: 'cetirizine', generic_name: 'Cetirizine', unit_label: '10 mg tablet', max_daily_dose_mg: 10, nlem_code: 'NLEM-A06' },
  { id: 'omeprazole', generic_name: 'Omeprazole', unit_label: '20 mg capsule', max_daily_dose_mg: 40, nlem_code: 'NLEM-A07' },
  { id: 'azithromycin', generic_name: 'Azithromycin', unit_label: '500 mg tablet', max_daily_dose_mg: 500, nlem_code: 'NLEM-A08' },
  { id: 'ibuprofen', generic_name: 'Ibuprofen', unit_label: '400 mg tablet', max_daily_dose_mg: 2400, nlem_code: 'NLEM-A09' },
  { id: 'domperidone', generic_name: 'Domperidone', unit_label: '10 mg tablet', max_daily_dose_mg: 30, nlem_code: 'NLEM-A10' },
];

const BRAND_GENERIC = [
  ['Dolo 650', 'paracetamol'], ['Crocin', 'paracetamol'], ['Calpol', 'paracetamol'],
  ['Electral', 'ors'], ['ORSL', 'ors'], ['Enerzal', 'ors'],
  ['Novamox', 'amoxicillin'], ['Mox', 'amoxicillin'], ['Almox', 'amoxicillin'],
  ['Glycomet', 'metformin'], ['Gluformin', 'metformin'], ['Glyciphage', 'metformin'],
  ['Amlopres', 'amlodipine'], ['Amlodac', 'amlodipine'], ['Stamlo', 'amlodipine'],
  ['Cetrizet', 'cetirizine'], ['Alerid', 'cetirizine'], ['Zyrtec', 'cetirizine'],
  ['Omez', 'omeprazole'], ['Ocid', 'omeprazole'], ['Protoloc', 'omeprazole'],
  ['Azithral', 'azithromycin'], ['Zithrox', 'azithromycin'], ['Azee', 'azithromycin'],
  ['Brufen', 'ibuprofen'], ['Ibugesic', 'ibuprofen'], ['Combiflam', 'ibuprofen'],
  ['Domstal', 'domperidone'], ['Vomiheal', 'domperidone'], ['Domperi', 'domperidone'],
];

const ABBREVIATIONS = [
  ['OD', 'once a day'], ['BD', 'twice a day'], ['TDS', 'three times a day'],
  ['TID', 'three times a day'], ['QID', 'four times a day'], ['SOS', 'as needed'],
  ['PRN', 'as needed'], ['HS', 'at bedtime'], ['STAT', 'immediately'],
  ['1-0-1', 'morning and night'], ['1-1-1', 'morning, afternoon and night'],
  ['1-0-0', 'morning only'], ['0-0-1', 'night only'], ['1-1-0', 'morning and afternoon'],
  ['PO', 'by mouth'], ['AC', 'before food'], ['PC', 'after food'],
];

const ALLERGY_CLASSES = [
  ['amoxicillin', 'penicillin'],
  ['azithromycin', 'macrolide'],
  ['ibuprofen', 'nsaid'],
];

// Small hand-built reference table (~20 pairs). Demo-relevant pairs use the
// 10 NLEM medicines above; the rest are well-known pairs kept for reference
// even though this demo's medicine list won't always trigger them.
const INTERACTIONS = [
  ['ibuprofen', 'amlodipine', 'moderate', 'NSAIDs can blunt the blood-pressure-lowering effect of amlodipine.'],
  ['ibuprofen', 'metformin', 'moderate', 'NSAIDs can impair renal clearance; caution in renal impairment.'],
  ['azithromycin', 'domperidone', 'moderate', 'Both can prolong the QT interval — avoid combining where possible.'],
  ['omeprazole', 'clopidogrel', 'moderate', 'Omeprazole may reduce the antiplatelet effect of clopidogrel.'],
  ['warfarin', 'azithromycin', 'moderate', 'Macrolides can potentiate warfarin, raising INR.'],
  ['warfarin', 'ibuprofen', 'major', 'Combined bleeding risk — NSAIDs plus anticoagulants.'],
  ['warfarin', 'aspirin', 'major', 'Combined bleeding risk.'],
  ['sildenafil', 'nitrates', 'major', 'Risk of severe, life-threatening hypotension.'],
  ['simvastatin', 'azithromycin', 'moderate', 'Macrolides can raise statin levels, increasing myopathy risk.'],
  ['methotrexate', 'trimethoprim', 'major', 'Combined folate-antagonist toxicity.'],
  ['digoxin', 'amiodarone', 'major', 'Amiodarone raises digoxin levels — risk of toxicity.'],
  ['theophylline', 'ciprofloxacin', 'moderate', 'Ciprofloxacin can raise theophylline levels.'],
  ['lithium', 'ibuprofen', 'moderate', 'NSAIDs can raise lithium levels.'],
  ['phenytoin', 'valproate', 'moderate', 'Complex protein-binding interaction — monitor levels.'],
  ['ace inhibitor', 'spironolactone', 'moderate', 'Risk of hyperkalaemia.'],
  ['maoi', 'ssri', 'major', 'Risk of serotonin syndrome.'],
  ['metformin', 'contrast dye', 'moderate', 'Risk of lactic acidosis in renal impairment — hold around imaging.'],
  ['amoxicillin', 'oral contraceptive', 'minor', 'Rare reports of reduced contraceptive efficacy.'],
  ['omeprazole', 'atazanavir', 'major', 'PPIs markedly reduce atazanavir absorption.'],
  ['ibuprofen', 'ssri', 'moderate', 'Combined bleeding risk (GI).'],
];

function seedMedicines() {
  const insertMed = db.prepare(
    'INSERT INTO medicines (id, generic_name, unit_label, max_daily_dose_mg, nlem_code) VALUES (@id, @generic_name, @unit_label, @max_daily_dose_mg, @nlem_code)'
  );
  for (const m of MEDICINES) insertMed.run(m);

  const insertBrand = db.prepare('INSERT INTO brand_generic (brand, medicine_id) VALUES (?, ?)');
  for (const [brand, id] of BRAND_GENERIC) insertBrand.run(brand, id);

  const insertAbbrev = db.prepare('INSERT INTO abbreviations (abbrev, expansion) VALUES (?, ?)');
  for (const [abbrev, expansion] of ABBREVIATIONS) insertAbbrev.run(abbrev, expansion);

  const insertClass = db.prepare('INSERT INTO allergy_classes (medicine_id, class) VALUES (?, ?)');
  for (const [id, cls] of ALLERGY_CLASSES) insertClass.run(id, cls);

  const insertInteraction = db.prepare(
    'INSERT INTO interactions (drug_a, drug_b, severity, note) VALUES (?, ?, ?, ?)'
  );
  for (const [a, b, severity, note] of INTERACTIONS) insertInteraction.run(a, b, severity, note);
}

const PATIENTS = [
  {
    id: 'pat-001',
    name: 'Lakshmi Raman',
    age: 52,
    gender: 'F',
    phone: '9800000001',
    language: 'ta',
    message_format: 'both',
    whatsapp_consent: 1,
    allergies: ['Penicillin'],
    chronic_conditions: ['Type 2 Diabetes', 'Hypertension'],
  },
  {
    id: 'pat-002',
    name: 'Ramesh Kumar',
    age: 34,
    gender: 'M',
    phone: '9800000002',
    language: 'hi',
    message_format: 'text',
    whatsapp_consent: 0,
    allergies: [],
    chronic_conditions: [],
  },
  {
    id: 'pat-003',
    name: 'Meena Devi (for child Aarav, 8y)',
    age: 8,
    gender: 'M',
    phone: '9800000003',
    language: 'hi',
    message_format: 'voice',
    whatsapp_consent: 1,
    allergies: [],
    chronic_conditions: [],
  },
  {
    id: 'pat-004',
    name: 'Suresh Pillai',
    age: 67,
    gender: 'M',
    phone: '9800000004',
    language: 'ta',
    message_format: 'both',
    whatsapp_consent: 1,
    allergies: [],
    chronic_conditions: ['Hypertension'],
  },
];

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function seedPatients() {
  const insert = db.prepare(`
    INSERT INTO patients (id, name, age, gender, phone, language, message_format, whatsapp_consent, whatsapp_window_opened_at, allergies, chronic_conditions, created_at)
    VALUES (@id, @name, @age, @gender, @phone, @language, @message_format, @whatsapp_consent, @whatsapp_window_opened_at, @allergies, @chronic_conditions, @created_at)
  `);
  for (const p of PATIENTS) {
    insert.run({
      ...p,
      whatsapp_window_opened_at: p.whatsapp_consent ? daysAgoISO(0) : null,
      allergies: JSON.stringify(p.allergies),
      chronic_conditions: JSON.stringify(p.chronic_conditions),
      created_at: daysAgoISO(120),
    });
  }

  const insertEncounter = db.prepare(`
    INSERT INTO encounters (
      patient_id, facility_id, doctor_name, doctor_reg_no, chief_complaint,
      dictation_raw, dictation_lang, normalized_text, vitals, diagnosis, medications,
      warnings, override_reasons, advice_english, advice_patient_lang, status, created_at, approved_at, approved_by
    ) VALUES (
      @patient_id, @facility_id, @doctor_name, @doctor_reg_no, @chief_complaint,
      @dictation_raw, @dictation_lang, @normalized_text, @vitals, @diagnosis, @medications,
      @warnings, @override_reasons, @advice_english, @advice_patient_lang, @status, @created_at, @approved_at, @approved_by
    )
  `);

  // Past history for pat-001 (Lakshmi Raman) — diabetes + hypertension follow-ups.
  insertEncounter.run({
    patient_id: 'pat-001',
    facility_id: 'phc-1',
    doctor_name: 'Dr. Anitha Selvam',
    doctor_reg_no: 'TN-MC-44210',
    chief_complaint: 'Routine diabetes review',
    dictation_raw: 'Sugar under control, continue metformin 500 BD',
    dictation_lang: 'en',
    normalized_text: 'Sugar under control, continue metformin 500 mg twice a day',
    vitals: JSON.stringify({ bp: '146/90', pulse: '82', tempC: '36.8', weightKg: '68' }),
    diagnosis: 'Type 2 Diabetes Mellitus — routine review',
    medications: JSON.stringify([
      { raw: 'metformin 500 BD', generic: 'metformin', dose: '500 mg', frequency: 'twice a day', duration: '30 days' },
    ]),
    warnings: JSON.stringify([]),
    override_reasons: JSON.stringify([]),
    advice_english: 'Continue metformin as prescribed. Watch for excessive thirst or dizziness.',
    advice_patient_lang: 'மெட்ஃபார்மின் மருந்தை பரிந்துரைத்தபடி தொடரவும். அதிக தாகம் அல்லது தலைச்சுற்றல் இருந்தால் PHC-க்கு வரவும்.',
    status: 'approved',
    created_at: daysAgoISO(42),
    approved_at: daysAgoISO(42),
    approved_by: 'Dr. Anitha Selvam',
  });
  insertEncounter.run({
    patient_id: 'pat-001',
    facility_id: 'phc-1',
    doctor_name: 'Dr. Anitha Selvam',
    doctor_reg_no: 'TN-MC-44210',
    chief_complaint: 'Blood pressure follow-up, mild headache',
    dictation_raw: 'BP high, start amlodipine 5 OD',
    dictation_lang: 'en',
    normalized_text: 'BP high, start amlodipine 5 mg once a day',
    vitals: JSON.stringify({ bp: '152/94', pulse: '86', tempC: '37.0', weightKg: '69' }),
    diagnosis: 'Hypertension, newly started on treatment',
    medications: JSON.stringify([
      { raw: 'amlodipine 5 OD', generic: 'amlodipine', dose: '5 mg', frequency: 'once a day', duration: '30 days' },
    ]),
    warnings: JSON.stringify([]),
    override_reasons: JSON.stringify([]),
    advice_english: 'Start amlodipine once daily. Return if ankles swell or dizziness occurs.',
    advice_patient_lang: 'அம்லோடிபைன் ஒரு நாளைக்கு ஒரு முறை தொடங்கவும். கால் வீக்கம் அல்லது தலைச்சுற்றல் இருந்தால் திரும்பி வரவும்.',
    status: 'approved',
    created_at: daysAgoISO(10),
    approved_at: daysAgoISO(10),
    approved_by: 'Dr. Anitha Selvam',
  });

  // Past history for pat-004 (Suresh Pillai) — hypertension.
  insertEncounter.run({
    patient_id: 'pat-004',
    facility_id: 'phc-1',
    doctor_name: 'Dr. Anitha Selvam',
    doctor_reg_no: 'TN-MC-44210',
    chief_complaint: 'Hypertension review',
    dictation_raw: 'BP controlled, continue amlodipine 5 OD',
    dictation_lang: 'en',
    normalized_text: 'BP controlled, continue amlodipine 5 mg once a day',
    vitals: JSON.stringify({ bp: '134/84', pulse: '76', tempC: '36.7', weightKg: '74' }),
    diagnosis: 'Hypertension — controlled',
    medications: JSON.stringify([
      { raw: 'amlodipine 5 OD', generic: 'amlodipine', dose: '5 mg', frequency: 'once a day', duration: '30 days' },
    ]),
    warnings: JSON.stringify([]),
    override_reasons: JSON.stringify([]),
    advice_english: 'Continue amlodipine as prescribed.',
    advice_patient_lang: 'அம்லோடிபைன் மருந்தை பரிந்துரைத்தபடி தொடரவும்.',
    status: 'approved',
    created_at: daysAgoISO(25),
    approved_at: daysAgoISO(25),
    approved_by: 'Dr. Anitha Selvam',
  });
}

// Small deterministic PRNG so the demo data is reproducible across seeds.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedInventoryAndUsage() {
  const rand = mulberry32(20260914);
  const insertInventory = db.prepare(
    'INSERT INTO inventory (facility_id, medicine_id, batch_no, expiry_date, stock_qty) VALUES (?, ?, ?, ?, ?)'
  );
  const insertUsage = db.prepare(
    'INSERT INTO usage_history (facility_id, medicine_id, date, qty_used) VALUES (?, ?, ?, ?)'
  );
  const insertSettings = db.prepare(`
    INSERT INTO medicine_facility_settings
      (facility_id, medicine_id, seasonal_multiplier, surge_months, lead_time_days, safety_stock_days, cycle_days)
    VALUES (@facility_id, @medicine_id, @seasonal_multiplier, @surge_months, @lead_time_days, @safety_stock_days, @cycle_days)
  `);

  // Baseline daily usage per medicine (units/day) at the PHC, before any surge.
  const BASELINE = {
    paracetamol: 18, ors: 10, amoxicillin: 9, metformin: 14, amlodipine: 8,
    cetirizine: 6, omeprazole: 5, azithromycin: 3, ibuprofen: 7, domperidone: 4,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const med of MEDICINES) {
    const base = BASELINE[med.id];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      let qty = Math.max(0, Math.round(base * (0.75 + rand() * 0.5)));

      // Monsoon surge, built into the synthetic history: ORS use climbs sharply
      // in the most recent week so the surge flag fires in the demo.
      if (med.id === 'ors' && i < 7) {
        qty = Math.round(qty * (2.2 + rand() * 0.6));
      }
      insertUsage.run('phc-1', med.id, dateStr, qty);
    }

    // CHC keeps a lighter, steadier usage history (it dispenses less directly).
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const qty = Math.max(0, Math.round(base * 0.3 * (0.7 + rand() * 0.6)));
      insertUsage.run('chc-1', med.id, dateStr, qty);
    }

    insertSettings.run({
      facility_id: 'phc-1',
      medicine_id: med.id,
      seasonal_multiplier: med.id === 'ors' ? 1.5 : 1.0,
      surge_months: med.id === 'ors' ? JSON.stringify([6, 7, 8, 9]) : '[]',
      lead_time_days: 3,   // PHC <- CHC, per task.md assumption
      safety_stock_days: 3,
      cycle_days: 30,
    });
    insertSettings.run({
      facility_id: 'chc-1',
      medicine_id: med.id,
      seasonal_multiplier: med.id === 'ors' ? 1.5 : 1.0,
      surge_months: med.id === 'ors' ? JSON.stringify([6, 7, 8, 9]) : '[]',
      lead_time_days: 7,   // CHC <- district warehouse, per task.md assumption
      safety_stock_days: 5,
      cycle_days: 30,
    });
  }

  // Current stock levels. ORS is deliberately low (about to run out given the
  // surge above); cetirizine has a batch near expiry.
  const STOCK_PHC = {
    paracetamol: { qty: 620, expiryDays: 400 },
    ors: { qty: 22, expiryDays: 300 },       // low — will trip Reorder given the surge
    amoxicillin: { qty: 260, expiryDays: 250 },
    metformin: { qty: 410, expiryDays: 500 },
    amlodipine: { qty: 300, expiryDays: 450 },
    cetirizine: { qty: 180, expiryDays: 20 }, // near-expiry batch
    omeprazole: { qty: 150, expiryDays: 200 },
    azithromycin: { qty: 90, expiryDays: 180 },
    ibuprofen: { qty: 210, expiryDays: 220 },
    domperidone: { qty: 120, expiryDays: 240 },
  };
  for (const med of MEDICINES) {
    const s = STOCK_PHC[med.id];
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + s.expiryDays);
    insertInventory.run('phc-1', med.id, `B-${med.id.slice(0, 3).toUpperCase()}-1`, expiry.toISOString().slice(0, 10), s.qty);
  }

  // CHC holds a larger reserve of everything (it's the level above the PHC).
  for (const med of MEDICINES) {
    const s = STOCK_PHC[med.id];
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + Math.max(s.expiryDays, 200));
    insertInventory.run('chc-1', med.id, `B-${med.id.slice(0, 3).toUpperCase()}-CHC1`, expiry.toISOString().slice(0, 10), Math.round(s.qty * 4));
  }
}

export function ensureSeeded() {
  if (isSeeded()) return;
  const seedAll = db.transaction(() => {
    seedFacilities();
    seedMedicines();
    seedPatients();
    seedInventoryAndUsage();
  });
  seedAll();
  console.log('Seeded synthetic demo data (facilities, medicines, patients, inventory, 90-day usage history).');
}
