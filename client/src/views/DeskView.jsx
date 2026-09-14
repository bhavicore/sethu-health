import { useState } from 'react';
import QRCode from 'qrcode';
import { careApi } from '../lib/careApi';

const EMPTY_FORM = {
  name: '', age: '', gender: '', phone: '', language: 'hi', messageFormat: 'text',
  allergies: '', chronicConditions: '',
};

export default function DeskView({ onSendToDoctor }) {
  const [lookupPhone, setLookupPhone] = useState('');
  const [found, setFound] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [registered, setRegistered] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleLookup(e) {
    e.preventDefault();
    setError(null);
    setFound(null);
    setNotFound(false);
    try {
      const { patient } = await careApi.lookupPatient(lookupPhone.trim());
      setFound(patient);
    } catch (err) {
      setNotFound(true);
      setForm((f) => ({ ...f, phone: lookupPhone.trim() }));
      setError(err.message);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { patient } = await careApi.registerPatient({
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender || null,
        phone: form.phone.trim(),
        language: form.language,
        messageFormat: form.messageFormat,
        allergies: form.allergies.split(',').map((s) => s.trim()).filter(Boolean),
        chronicConditions: form.chronicConditions.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setRegistered(patient);
      setForm(EMPTY_FORM);
      if (patient.messageFormat !== 'text') {
        const waNumber = import.meta.env.VITE_WHATSAPP_DEMO_NUMBER || '910000000000';
        const url = await QRCode.toDataURL(`https://wa.me/${waNumber}?text=Hi`, { margin: 2, width: 240 });
        setQrDataUrl(url);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmWhatsapp(patientId) {
    const { patient } = await careApi.confirmWhatsapp(patientId);
    setRegistered(patient);
  }

  return (
    <div className="view">
      <header className="view__header">
        <h1>Registration Desk</h1>
        <p className="muted">Look up a returning patient by phone, or register a new one.</p>
      </header>

      <form className="card" onSubmit={handleLookup} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="lookupPhone">Returning patient — phone number</label>
          <input id="lookupPhone" value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} placeholder="98000 00001" />
        </div>
        <button className="btn btn--primary" type="submit">Look up</button>
      </form>

      {found && (
        <section className="card">
          <h2>Found: {found.name}</h2>
          <p className="muted small">{found.age} {found.gender} · {found.phone} · {found.language.toUpperCase()} · {found.messageFormat}</p>
          {found.allergies.length > 0 && <p className="form-error">⚠ Allergies: {found.allergies.join(', ')}</p>}
          <button className="btn btn--primary" onClick={() => onSendToDoctor(found.id)}>Send to Doctor →</button>
        </section>
      )}

      {notFound && (
        <section className="card">
          <p className="muted">No record for this phone number. Register as a new patient below.</p>
        </section>
      )}

      {(notFound || !found) && (
        <form className="card form-grid" onSubmit={handleRegister}>
          <h2 className="field--full">New patient registration</h2>
          <div className="field"><label>Name *</label><input required value={form.name} onChange={update('name')} /></div>
          <div className="field field--small"><label>Age *</label><input required type="number" min="0" value={form.age} onChange={update('age')} /></div>
          <div className="field field--small">
            <label>Gender</label>
            <select value={form.gender} onChange={update('gender')}>
              <option value="">—</option><option value="F">Female</option><option value="M">Male</option><option value="Other">Other</option>
            </select>
          </div>
          <div className="field"><label>Phone *</label><input required value={form.phone} onChange={update('phone')} /></div>
          <div className="field field--small">
            <label>Language</label>
            <select value={form.language} onChange={update('language')}>
              <option value="hi">Hindi</option><option value="ta">Tamil</option><option value="en">English</option>
            </select>
          </div>
          <div className="field field--small">
            <label>Message format</label>
            <select value={form.messageFormat} onChange={update('messageFormat')}>
              <option value="text">Text (printout only)</option>
              <option value="voice">Voice (WhatsApp)</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="field field--full">
            <label>Allergies (comma-separated — ask every first-time patient)</label>
            <input value={form.allergies} onChange={update('allergies')} placeholder="e.g. Penicillin" />
          </div>
          <div className="field field--full">
            <label>Chronic conditions (comma-separated)</label>
            <input value={form.chronicConditions} onChange={update('chronicConditions')} placeholder="e.g. Hypertension, Diabetes" />
          </div>
          <div className="field field--full form-actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>Register patient</button>
          </div>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}

      {registered && (
        <section className="card">
          <h2>Registered: {registered.name}</h2>
          <p className="muted small">Patient ID {registered.id} · {registered.phone}</p>
          {registered.messageFormat !== 'text' && (
            <div style={{ textAlign: 'center' }}>
              <p className="muted small">
                Voice-preference patient — scan this QR with WhatsApp and send the pre-filled "Hi" to open the
                24-hour window for today's voice note.
              </p>
              {qrDataUrl && <img src={qrDataUrl} alt="WhatsApp opt-in QR" style={{ width: 200, margin: '0.75rem auto' }} />}
              {!registered.whatsappConsent ? (
                <button className="btn btn--secondary btn--sm" onClick={() => handleConfirmWhatsapp(registered.id)}>
                  Simulate: patient scanned &amp; sent "Hi"
                </button>
              ) : (
                <span className="badge badge--synced">WhatsApp window open</span>
              )}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn--primary" onClick={() => onSendToDoctor(registered.id)}>Send to Doctor →</button>
          </div>
        </section>
      )}
    </div>
  );
}
