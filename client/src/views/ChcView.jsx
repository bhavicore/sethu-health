import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { decodePayload, decodeQrFromImageFile } from '../lib/qr';
import { saveScannedVisit, listVisits } from '../lib/db';

const READER_ID = 'chc-qr-reader';

// Force the bundled ZXing decoder instead of Chrome's native BarcodeDetector API,
// which lazily fetches its detection model from Google's update servers on first
// use — a network dependency this offline-first app cannot assume is available.
const DECODER_CONFIG = { useBarCodeDetectorIfSupported: false };

function payloadToVisit(payload) {
  return {
    localId: payload.id,
    createdAt: payload.ts,
    name: payload.name,
    age: payload.age,
    gender: payload.gender,
    abhaId: payload.abha,
    facility: payload.phc,
    symptoms: payload.sym,
    diagnosis: payload.dx,
    medications: payload.meds,
    allergies: payload.all,
    notes: payload.notes,
  };
}

export default function ChcView() {
  const [scanning, setScanning] = useState(false);
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const scannerRef = useRef(null);

  useEffect(() => {
    listVisits().then((all) => setHistory(all.filter((v) => v.origin === 'chc-scan')));
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecodedText(text) {
    try {
      const payload = decodePayload(text);
      setDecoded(payload);
      setError(null);
      const visit = payloadToVisit(payload);
      await saveScannedVisit(visit);
      const all = await listVisits();
      setHistory(all.filter((v) => v.origin === 'chc-scan'));
    } catch (err) {
      setError(err.message);
      setDecoded(null);
    }
  }

  async function startCamera() {
    setError(null);
    setScanning(true);
    try {
      const instance = new Html5Qrcode(READER_ID, DECODER_CONFIG);
      scannerRef.current = instance;
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (text) => {
          handleDecodedText(text);
          stopCamera();
        },
        () => {} // per-frame decode errors are expected while aiming the camera
      );
    } catch (err) {
      setError(`Camera unavailable: ${err.message || err}`);
      setScanning(false);
    }
  }

  async function stopCamera() {
    const instance = scannerRef.current;
    if (instance) {
      try {
        await instance.stop();
        instance.clear();
      } catch {
        // already stopped
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await decodeQrFromImageFile(file);
      await handleDecodedText(text);
    } catch (err) {
      setError(`Could not read QR from image: ${err.message || err}`);
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="view">
      <header className="view__header">
        <h1>CHC — Scan Referral</h1>
        <p className="muted">
          Scan the patient's QR card. No login, no internet required — the full history is in
          the code itself.
        </p>
      </header>

      <section className="card scan-panel">
        <div id={READER_ID} className="qr-reader" />
        <div className="scan-panel__controls">
          {!scanning ? (
            <button className="btn btn--primary" onClick={startCamera}>
              Start camera scan
            </button>
          ) : (
            <button className="btn btn--secondary" onClick={stopCamera}>
              Stop camera
            </button>
          )}
          <label className="btn btn--secondary btn--file">
            Upload QR image
            <input type="file" accept="image/*" hidden onChange={handleFileChosen} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>

      {decoded && (
        <section className="card history-result">
          <h2>History available instantly</h2>
          <p className="referral-card__patient">
            {decoded.name} · {decoded.age}{decoded.gender ? `, ${decoded.gender}` : ''}
          </p>
          {decoded.abha && <p className="muted small">ABHA {decoded.abha} — linked to ABDM (mock)</p>}
          <dl>
            <dt>PHC</dt>
            <dd>{decoded.phc || '—'}</dd>
            <dt>Symptoms</dt>
            <dd>{decoded.sym || '—'}</dd>
            <dt>Diagnosis</dt>
            <dd>{decoded.dx || '—'}</dd>
            <dt>Medications</dt>
            <dd>{decoded.meds || '—'}</dd>
            <dt>Allergies</dt>
            <dd>{decoded.all || '—'}</dd>
            <dt>Notes</dt>
            <dd>{decoded.notes || '—'}</dd>
            <dt>Visit date</dt>
            <dd>{decoded.ts ? new Date(decoded.ts).toLocaleString() : '—'}</dd>
          </dl>
        </section>
      )}

      <section className="card">
        <h2>Scanned at this device ({history.length})</h2>
        {history.length === 0 && <p className="muted">No referral cards scanned yet.</p>}
        <ul className="visit-list">
          {history.map((v) => (
            <li key={v.localId} className="visit-list__item">
              <div>
                <strong>{v.name}</strong>
                <span className="muted"> · {v.age}{v.gender ? `, ${v.gender}` : ''}</span>
                <div className="muted small">{v.diagnosis || v.symptoms || 'No diagnosis recorded'}</div>
              </div>
              <span className="muted small">{new Date(v.scannedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
