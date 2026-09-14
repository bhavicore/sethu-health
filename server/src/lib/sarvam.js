// Sarvam AI wrappers: Saaras speech-to-text (Task 2.1) and Bulbul text-to-speech
// (Task 2.3). Both are optional — without SARVAM_API_KEY the doctor types the
// dictation directly and voice-preference patients simply don't get a voice
// note (the printout still carries the advice in their language either way).
//
// Request/response shapes follow Sarvam's public docs as of this build; if
// their API has moved on, adjust buildSttForm/parseSttResponse here — the
// rest of the app only depends on the functions below, not the wire format.

const STT_URL = 'https://api.sarvam.ai/speech-to-text';
const TTS_URL = 'https://api.sarvam.ai/text-to-speech';

function hasKey() {
  return Boolean(process.env.SARVAM_API_KEY);
}

export function sarvamConfigured() {
  return hasKey();
}

const LANGUAGE_CODES = { hi: 'hi-IN', ta: 'ta-IN', en: 'en-IN' };

/**
 * Transcribe a short dictation clip. `audioBuffer` is raw audio bytes (webm/wav),
 * `language` is 'hi' | 'ta' | 'en'. Clips under 30s go straight to the REST
 * endpoint per Task 3.1; longer clips should be chunked by the caller.
 */
export async function transcribeAudio({ audioBuffer, mimeType = 'audio/webm', language = 'hi', codemix = true }) {
  if (!hasKey()) {
    return { transcript: null, mock: true, note: 'SARVAM_API_KEY not set — type the dictation instead.' };
  }

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType }), 'dictation.webm');
  form.append('model', 'saaras:v2.5');
  form.append('language_code', LANGUAGE_CODES[language] || 'hi-IN');
  if (codemix) form.append('mode', 'codemix');

  try {
    const res = await fetch(STT_URL, {
      method: 'POST',
      headers: { 'API-Subscription-Key': process.env.SARVAM_API_KEY },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sarvam STT error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const transcript = data.transcript ?? data.text ?? null;
    return { transcript, mock: false, raw: data };
  } catch (err) {
    return { transcript: null, mock: true, note: `Sarvam STT call failed (${err.message}); type the dictation instead.` };
  }
}

/**
 * Synthesize a short Hindi/Tamil voice note (Bulbul v3) for the dose schedule
 * and warning signs. Returns base64 audio, or a mock flag if no key is set —
 * only called for patients who chose voice, to save credits.
 */
export async function synthesizeSpeech({ text, language = 'hi' }) {
  if (!hasKey()) {
    return { audioBase64: null, mock: true, note: 'SARVAM_API_KEY not set — no voice note generated for this demo run.' };
  }

  try {
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        'API-Subscription-Key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        target_language_code: LANGUAGE_CODES[language] || 'hi-IN',
        model: 'bulbul:v3',
        speaker: 'meera',
        audio_format: 'ogg',
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Sarvam TTS error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const audioBase64 = data.audios?.[0] ?? data.audio ?? null;
    return { audioBase64, mock: false };
  } catch (err) {
    return { audioBase64: null, mock: true, note: `Sarvam TTS call failed (${err.message}).` };
  }
}
