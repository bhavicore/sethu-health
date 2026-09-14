// Gemini is used for exactly two narrow things per task.md:
//  1. Rewording doctor-approved, de-identified English instructions into
//     plain-language Hindi/Tamil patient advice (never adding diagnoses/doses).
//  2. Writing a short justification note for an inventory indent — the
//     numbers themselves always come from clinical/inventory.js, never the model.
// If GEMINI_API_KEY isn't set, both fall back to plain templates so the demo
// still runs end-to-end without a key.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function hasKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callGemini(prompt, { json = false } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: json ? { responseMimeType: 'application/json' } : {},
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return text;
}

const LANGUAGE_NAMES = { hi: 'Hindi', ta: 'Tamil', en: 'English' };

/**
 * Reword doctor-approved, de-identified English advice into the patient's
 * language, plus an English back-translation so the doctor (who may not read
 * Hindi/Tamil) can double-check the meaning before it goes out.
 * Never receives patient name/ABHA/phone/village — caller strips PII first.
 */
export async function rewordAdviceForPatient({ englishInstructions, language }) {
  const langName = LANGUAGE_NAMES[language] || 'Hindi';

  if (!hasKey()) {
    return {
      patientLanguageText: englishInstructions,
      englishBackTranslation: englishInstructions,
      mock: true,
      note: `GEMINI_API_KEY not set — showing the English advice unchanged instead of ${langName}. Set GEMINI_API_KEY to enable real translation.`,
    };
  }

  const prompt = `You are rewording a doctor's already-approved patient instructions into simple, ` +
    `plain ${langName} that a low-literacy patient can understand. Do not add, remove, or change any ` +
    `diagnosis, medicine, dose, or medical fact — only reword for clarity and simplicity in ${langName}. ` +
    `Also provide a literal English back-translation of your ${langName} text, so a doctor who does not ` +
    `read ${langName} can verify nothing was added or changed.\n\n` +
    `Doctor-approved English instructions:\n"""${englishInstructions}"""\n\n` +
    `Respond as JSON: {"patientLanguageText": "...", "englishBackTranslation": "..."}`;

  try {
    const text = await callGemini(prompt, { json: true });
    const parsed = JSON.parse(text);
    return {
      patientLanguageText: parsed.patientLanguageText,
      englishBackTranslation: parsed.englishBackTranslation,
      mock: false,
    };
  } catch (err) {
    return {
      patientLanguageText: englishInstructions,
      englishBackTranslation: englishInstructions,
      mock: true,
      note: `Gemini call failed (${err.message}); showing English advice unchanged.`,
    };
  }
}

/**
 * Short justification note for an indent. All quantities are computed by
 * clinical/inventory.js and passed in verbatim — the model only phrases them.
 */
export async function draftIndentJustification(stats) {
  const {
    medicineName, daysOfStockLeft, avg7, avg90, surgeFlag, adjustedDailyUse, indentQty, hasNearExpiry,
  } = stats;

  const fallback =
    `${medicineName}: ~${Math.max(0, Math.round(daysOfStockLeft))} day(s) of stock left at current use ` +
    `(7-day avg ${avg7.toFixed(1)}/day, 90-day avg ${avg90.toFixed(1)}/day).` +
    (surgeFlag ? ' Usage has surged over the last week — likely a seasonal spike.' : '') +
    (hasNearExpiry ? ' One or more batches are nearing expiry — use these first.' : '') +
    ` Requesting ${indentQty} units to cover the next cycle.`;

  if (!hasKey()) {
    return { text: fallback, mock: true, note: 'GEMINI_API_KEY not set — using a template note instead of Gemini.' };
  }

  const prompt =
    `Write a one-to-two sentence justification note for a PHC medicine indent (requisition) to a CHC. ` +
    `Use ONLY these facts, do not invent numbers or add clinical advice:\n` +
    `Medicine: ${medicineName}\nDays of stock left: ${Math.round(daysOfStockLeft)}\n` +
    `7-day average daily use: ${avg7.toFixed(1)}\n90-day average daily use: ${avg90.toFixed(1)}\n` +
    `Adjusted daily use (with seasonal multiplier): ${adjustedDailyUse.toFixed(1)}\n` +
    `Surge detected: ${surgeFlag ? 'yes' : 'no'}\nNear-expiry batch present: ${hasNearExpiry ? 'yes' : 'no'}\n` +
    `Requested quantity: ${indentQty} units.\n` +
    `Write plainly, as a PHC medical officer would for a CHC in-charge.`;

  try {
    const text = await callGemini(prompt);
    return { text: text.trim() || fallback, mock: false };
  } catch (err) {
    return { text: fallback, mock: true, note: `Gemini call failed (${err.message}); using a template note.` };
  }
}

export function geminiConfigured() {
  return hasKey();
}
