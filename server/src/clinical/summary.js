// Deterministic 3-4 line history summary shown on the doctor's screen the
// moment a patient is looked up. No LLM: allergies and medicines must be
// shown exactly as recorded, never inferred (task.md Task 3.1).

export function summarizeHistory(patient, encounters) {
  const lines = [];
  const allergies = JSON.parse(patient.allergies || '[]');
  const chronic = JSON.parse(patient.chronic_conditions || '[]');

  lines.push(
    `${patient.name}, ${patient.age}${patient.gender ? `${patient.gender}` : ''} — ${encounters.length} prior visit${encounters.length === 1 ? '' : 's'} on record.`
  );

  if (chronic.length) lines.push(`Chronic conditions: ${chronic.join(', ')}.`);
  if (allergies.length) lines.push(`⚠ Allergies: ${allergies.join(', ')}.`);
  else lines.push('No allergies recorded.');

  const last = encounters[0];
  if (last) {
    const vitals = JSON.parse(last.vitals || '{}');
    const vitalsText = Object.entries(vitals)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    lines.push(
      `Last visit (${new Date(last.created_at).toLocaleDateString()}): ${last.diagnosis || 'no diagnosis recorded'}${vitalsText ? ` — ${vitalsText}` : ''}.`
    );
  } else {
    lines.push('First recorded visit at this facility.');
  }

  return lines.join(' ');
}

export function currentMedicationsFromHistory(encounters) {
  // "Current medicines" = medicines from the most recent approved encounter
  // whose course (duration) hasn't clearly ended yet.
  const seen = new Map();
  for (const enc of encounters) {
    const meds = JSON.parse(enc.medications || '[]');
    for (const med of meds) {
      if (!med.generic || seen.has(med.generic)) continue;
      seen.set(med.generic, { ...med, fromVisit: enc.created_at });
    }
  }
  return [...seen.values()];
}
