import { db } from '../db.js';

// Deterministic, rule-based normalization — no LLM in this step. The doctor's
// own words are what get recorded; this only expands shorthand and maps
// brand names to generics so the checks in rules.js can run reliably, and
// shows the doctor the expanded form before they approve.

const FREQUENCY_TIMES_PER_DAY = {
  od: 1, bd: 2, tds: 3, tid: 3, qid: 4, hs: 1, stat: 1,
  sos: 0, prn: 0, // "as needed" — variable, excluded from a hard daily-dose ceiling
  '1-0-1': 2, '1-1-1': 3, '1-0-0': 1, '0-0-1': 1, '1-1-0': 2,
};

function loadReferenceData() {
  const medicines = db.prepare('SELECT * FROM medicines').all();
  const brandRows = db.prepare('SELECT * FROM brand_generic').all();
  const abbrevRows = db.prepare('SELECT * FROM abbreviations').all();

  const medicinesById = new Map(medicines.map((m) => [m.id, m]));
  const brandToGeneric = new Map(brandRows.map((r) => [r.brand.toLowerCase(), r.medicine_id]));
  const abbreviations = new Map(abbrevRows.map((r) => [r.abbrev.toLowerCase(), r.expansion]));

  // Longest-name-first so "amoxicillin" isn't partially shadowed by a shorter alias.
  const nameToMedicineId = new Map();
  for (const m of medicines) nameToMedicineId.set(m.generic_name.toLowerCase(), m.id);
  for (const r of brandRows) nameToMedicineId.set(r.brand.toLowerCase(), r.medicine_id);

  return { medicinesById, brandToGeneric, abbreviations, nameToMedicineId };
}

/** Expand abbreviations in free text for the doctor-facing "normalized" preview. */
export function expandAbbreviations(text) {
  if (!text) return text;
  const { abbreviations } = loadReferenceData();
  return text.replace(/\b[\w-]+\b/g, (token) => {
    const hit = abbreviations.get(token.toLowerCase());
    return hit ? `${token} (${hit})` : token;
  });
}

function extractDoseMg(line, medicine) {
  const mgMatch = line.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (mgMatch) return Number(mgMatch[1]);
  const bareNumberMatch = line.match(/\b(\d{2,4})\b/);
  if (bareNumberMatch && medicine?.unit_label?.match(/mg/i)) return Number(bareNumberMatch[1]);
  if (medicine?.max_daily_dose_mg != null) {
    const unitMatch = medicine.unit_label.match(/(\d+(?:\.\d+)?)\s*mg/i);
    if (unitMatch) return Number(unitMatch[1]);
  }
  return null;
}

function extractFrequency(line) {
  const patterns = Object.keys(FREQUENCY_TIMES_PER_DAY).sort((a, b) => b.length - a.length);
  const lower = line.toLowerCase();
  for (const p of patterns) {
    const re = new RegExp(`(?:^|[\\s,])${p.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:$|[\\s,.])`, 'i');
    if (re.test(lower)) {
      return { token: p.toUpperCase(), timesPerDay: FREQUENCY_TIMES_PER_DAY[p] };
    }
  }
  return null;
}

function extractDuration(line) {
  const match = line.match(/(\d+)\s*(?:day|days|d)\b/i);
  if (match) return Number(match[1]);
  return null;
}

/**
 * Parse one dictated/typed medication line (e.g. "Dolo 650 1-0-1 3 days",
 * "amoxicillin 500 TDS", "ORS SOS") into a structured entry. Unrecognised
 * medicine names are kept as-is with unmatched: true so the doctor sees them
 * flagged rather than silently dropped.
 */
export function parseMedicationLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;
  const { medicinesById, nameToMedicineId } = loadReferenceData();

  let matchedId = null;
  let matchedName = null;
  for (const [name, id] of nameToMedicineId.entries()) {
    if (new RegExp(`\\b${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(line)) {
      // Prefer the longest matching name (e.g. "amoxicillin" over a shorter false match).
      if (!matchedName || name.length > matchedName.length) {
        matchedName = name;
        matchedId = id;
      }
    }
  }

  const medicine = matchedId ? medicinesById.get(matchedId) : null;
  const frequency = extractFrequency(line);
  const durationDays = extractDuration(line);
  const doseMg = medicine ? extractDoseMg(line, medicine) : null;

  return {
    raw: line,
    matchedText: matchedName || null,
    generic: matchedId,
    genericName: medicine?.generic_name || null,
    unitLabel: medicine?.unit_label || null,
    doseMg,
    frequencyToken: frequency?.token || null,
    timesPerDay: frequency ? frequency.timesPerDay : null,
    durationDays,
    unmatched: !matchedId,
  };
}

/** Parse a block of medication lines (one per line) into structured entries. */
export function parseMedicationLines(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseMedicationLine);
}

export function getMedicineById(id) {
  const { medicinesById } = loadReferenceData();
  return medicinesById.get(id) || null;
}
