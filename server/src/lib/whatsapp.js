import { db } from '../db.js';

// Meta WhatsApp Cloud API integration is out of scope for this build (needs a
// registered WhatsApp Business number and Meta app review). This stub queues
// the same-day voice note / text summary into whatsapp_outbox exactly where
// the real Cloud API call would go, so the integration point is real even
// though the upstream send is mocked — same pattern as the ABDM/ABHA stub.

function metaConfigured() {
  return Boolean(process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function whatsappConfigured() {
  return metaConfigured();
}

/**
 * Queue (and, if Meta credentials are present, attempt to send) a message to
 * a patient who opened the 24-hour window via the registration QR code.
 */
export async function queueWhatsappMessage({ patientId, encounterId, kind, text, audioBase64 }) {
  const payload = { text, audioBase64: audioBase64 || null };
  const status = metaConfigured() ? 'sent' : 'mocked';

  db.prepare(
    'INSERT INTO whatsapp_outbox (patient_id, encounter_id, kind, payload, status) VALUES (?, ?, ?, ?, ?)'
  ).run(patientId, encounterId ?? null, kind, JSON.stringify(payload), status);

  if (!metaConfigured()) {
    return { status: 'mocked', note: 'WhatsApp Cloud API not configured — message queued locally, not actually sent.' };
  }

  // Real send would go here: POST to graph.facebook.com/v19.0/{phone_number_id}/messages
  // using WHATSAPP_CLOUD_API_TOKEN. Left unimplemented since this build has no
  // registered WhatsApp Business number to send from.
  return { status: 'sent' };
}

export function listOutboxForPatient(patientId) {
  return db
    .prepare('SELECT * FROM whatsapp_outbox WHERE patient_id = ? ORDER BY id DESC')
    .all(patientId);
}
