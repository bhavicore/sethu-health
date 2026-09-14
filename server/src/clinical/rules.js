import { db } from '../db.js';

// Deterministic Clinical Decision Support checks (Task 3.2). These are
// warnings, never blocks — the doctor can proceed after giving a short
// reason, which is logged (Doctor-in-Control Rule 5).

function loadAllergyClasses() {
  const rows = db.prepare('SELECT * FROM allergy_classes').all();
  const byMedicine = new Map();
  for (const r of rows) {
    if (!byMedicine.has(r.medicine_id)) byMedicine.set(r.medicine_id, []);
    byMedicine.get(r.medicine_id).push(r.class);
  }
  return byMedicine;
}

function loadInteractions() {
  return db.prepare('SELECT * FROM interactions').all();
}

/** Does any recorded patient allergy (verbatim strings) conflict with this medicine? */
function checkAllergyConflicts(medications, patientAllergies) {
  if (!patientAllergies?.length) return [];
  const allergyClasses = loadAllergyClasses();
  const warnings = [];
  const allergiesLower = patientAllergies.map((a) => a.toLowerCase());

  for (const med of medications) {
    if (!med.generic) continue;
    const classes = allergyClasses.get(med.generic) || [];
    const names = [med.genericName?.toLowerCase(), med.generic.toLowerCase(), ...classes].filter(Boolean);
    for (const allergy of allergiesLower) {
      if (names.some((n) => n === allergy || n.includes(allergy) || allergy.includes(n))) {
        warnings.push({
          type: 'allergy',
          severity: 'major',
          medicine: med.genericName || med.matchedText,
          message: `Patient has a recorded ${patientAllergies.find((a) => a.toLowerCase() === allergy)} allergy — conflicts with ${med.genericName || med.matchedText}.`,
        });
      }
    }
  }
  return warnings;
}

/** Drug-drug interactions among today's prescribed medicines. */
function checkInteractions(medications) {
  const interactions = loadInteractions();
  const warnings = [];
  const generics = medications.filter((m) => m.generic).map((m) => m.generic);

  for (let i = 0; i < generics.length; i++) {
    for (let j = i + 1; j < generics.length; j++) {
      const [a, b] = [generics[i], generics[j]];
      const hit = interactions.find(
        (row) =>
          (row.drug_a.toLowerCase() === a && row.drug_b.toLowerCase() === b) ||
          (row.drug_a.toLowerCase() === b && row.drug_b.toLowerCase() === a)
      );
      if (hit) {
        warnings.push({
          type: 'interaction',
          severity: hit.severity,
          medicine: `${a} + ${b}`,
          message: hit.note,
        });
      }
    }
  }
  return warnings;
}

/** Simple max-daily-dose ceiling check (dose x times/day vs. the medicine's known ceiling). */
function checkDoseLimits(medications) {
  const warnings = [];
  for (const med of medications) {
    if (!med.generic || med.doseMg == null || !med.timesPerDay) continue;
    const rowMax = db.prepare('SELECT max_daily_dose_mg FROM medicines WHERE id = ?').get(med.generic);
    const maxDailyMg = rowMax?.max_daily_dose_mg;
    if (maxDailyMg == null) continue;
    const dailyTotal = med.doseMg * med.timesPerDay;
    if (dailyTotal > maxDailyMg) {
      warnings.push({
        type: 'dose-limit',
        severity: 'major',
        medicine: med.genericName || med.matchedText,
        message: `${med.genericName || med.matchedText}: ${dailyTotal} mg/day exceeds the usual ceiling of ${maxDailyMg} mg/day.`,
      });
    }
  }
  return warnings;
}

/** Flag anything the doctor's dictation left unstated. */
function checkMissingDetails(medications) {
  const warnings = [];
  for (const med of medications) {
    const label = med.genericName || med.matchedText || med.raw;
    if (med.unmatched) {
      warnings.push({
        type: 'unmatched',
        severity: 'minor',
        medicine: med.raw,
        message: `"${med.raw}" wasn't recognised against the medicine or brand list — check spelling or add it manually.`,
      });
      continue;
    }
    if (!med.durationDays) {
      warnings.push({
        type: 'missing-detail',
        severity: 'minor',
        medicine: label,
        message: `${label}: duration not stated.`,
      });
    }
    if (!med.frequencyToken) {
      warnings.push({
        type: 'missing-detail',
        severity: 'minor',
        medicine: label,
        message: `${label}: frequency not stated.`,
      });
    }
  }
  return warnings;
}

/** Stock check against this facility's current inventory. */
function checkStock(medications, facilityId) {
  const warnings = [];
  for (const med of medications) {
    if (!med.generic) continue;
    const row = db
      .prepare('SELECT COALESCE(SUM(stock_qty), 0) AS qty FROM inventory WHERE facility_id = ? AND medicine_id = ?')
      .get(facilityId, med.generic);
    const label = med.genericName || med.matchedText;
    if (!row || row.qty <= 0) {
      warnings.push({
        type: 'stock',
        severity: 'moderate',
        medicine: label,
        message: `${label}: out of stock at this facility.`,
      });
    } else if (med.durationDays && med.timesPerDay && row.qty < med.durationDays * med.timesPerDay) {
      warnings.push({
        type: 'stock',
        severity: 'minor',
        medicine: label,
        message: `${label}: only ${row.qty} units left at this facility — may not cover the full course.`,
      });
    }
  }
  return warnings;
}

/**
 * Run every CDSS check against a draft encounter's parsed medications.
 * Returns a flat list of warnings; each carries type/severity/medicine/message.
 */
export function runClinicalChecks({ medications, patientAllergies, facilityId }) {
  return [
    ...checkAllergyConflicts(medications, patientAllergies),
    ...checkInteractions(medications),
    ...checkDoseLimits(medications),
    ...checkMissingDetails(medications),
    ...checkStock(medications, facilityId),
  ];
}
