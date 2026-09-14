import { useEffect, useMemo, useState } from 'react';
import { careApi } from '../lib/careApi';
import MicButton from '../components/MicButton';
import PrintableReport from '../components/PrintableReport';

const TEMPLATES = [
  { label: 'Fever', complaint: 'Fever for 3 days, no other symptoms', diagnosis: 'Viral fever', meds: 'Paracetamol 500 TDS 3 days' },
  { label: 'Diarrhoea', complaint: 'Loose motions for 2 days, mild dehydration', diagnosis: 'Acute gastroenteritis', meds: 'ORS SOS\nDomperidone 10 BD 3 days' },
  { label: 'Cough / cold', complaint: 'Cough and cold for 4 days', diagnosis: 'Upper respiratory tract infection', meds: 'Paracetamol 500 SOS\nCetirizine 10 OD 5 days' },
];

const DURATION_PICKS = [3, 5, 7];

const SEVERITY_ORDER = { major: 0, moderate: 1, minor: 2 };

const EMPTY_CONSULT = {
  chiefComplaint: '', diagnosis: '', medicationLines: '', adviceNotes: '',
  bp: '', pulse: '', tempC: '', weightKg: '',
};

export default function DoctorConsoleView({ activePatientId, facilityId = 'phc-1', doctorName, doctorRegNo, onDoctorIdentityChange }) {
  const [phone, setPhone] = useState('');
  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ geminiConfigured: false, sarvamConfigured: false });

  const [consult, setConsult] = useState(EMPTY_CONSULT);
  const [draft, setDraft] = useState(null);
  const [overrideReasons, setOverrideReasons] = useState({});
  const [drafting, setDrafting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(null);
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    careApi.config().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (activePatientId) loadPatient(activePatientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatientId]);

  async function loadPatient(id) {
    setError(null);
    try {
      const { patient: p, encounters, summary, currentMedications } = await careApi.patientHistory(id);
      setPatient(p);
      setHistory({ encounters, summary, currentMedications });
      setConsult(EMPTY_CONSULT);
      setDraft(null);
      setApproved(null);
      setOverrideReasons({});
      setStartedAt(Date.now());
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    setError(null);
    try {
      const { patient: p } = await careApi.lookupPatient(phone.trim());
      loadPatient(p.id);
    } catch (err) {
      setError(err.message);
    }
  }

  function applyTemplate(t) {
    setConsult((c) => ({ ...c, chiefComplaint: t.complaint, diagnosis: t.diagnosis, medicationLines: t.meds }));
  }

  function appendDuration(days) {
    setConsult((c) => {
      const lines = c.medicationLines.split('\n');
      const lastIdx = [...lines].map((l) => l.trim()).lastIndexOf(lines.map((l) => l.trim()).filter(Boolean).slice(-1)[0]);
      if (lastIdx < 0) return c;
      if (/day/i.test(lines[lastIdx])) return c;
      lines[lastIdx] = `${lines[lastIdx].trim()} ${days} days`;
      return { ...c, medicationLines: lines.join('\n') };
    });
  }

  function set(field) {
    return (e) => setConsult((c) => ({ ...c, [field]: e.target.value }));
  }
  function append(field) {
    return (text) => setConsult((c) => ({ ...c, [field]: c[field] ? `${c[field]} ${text}` : text }));
  }

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const d = await careApi.draftEncounter({
        patientId: patient.id,
        facilityId,
        chiefComplaint: consult.chiefComplaint,
        diagnosis: consult.diagnosis,
        medicationLines: consult.medicationLines,
      });
      setDraft(d);
      setOverrideReasons({});
    } catch (err) {
      setError(err.message);
    } finally {
      setDrafting(false);
    }
  }

  const unresolvedMajor = useMemo(() => {
    if (!draft) return [];
    return draft.warnings.filter((w) => w.severity === 'major' && !overrideReasons[w.message]?.trim());
  }, [draft, overrideReasons]);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await careApi.approveEncounter({
        patientId: patient.id,
        facilityId,
        doctorName,
        doctorRegNo,
        chiefComplaint: consult.chiefComplaint,
        dictationRaw: consult.chiefComplaint,
        dictationLang: 'en',
        diagnosis: consult.diagnosis,
        medications: draft.medications,
        vitals: { bp: consult.bp, pulse: consult.pulse, tempC: consult.tempC, weightKg: consult.weightKg },
        warnings: draft.warnings,
        overrideReasons: Object.entries(overrideReasons).map(([message, reason]) => ({ message, reason })),
        adviceNotes: consult.adviceNotes,
        approvedBy: doctorName,
      });
      setApproved(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  function startNewVisit() {
    loadPatient(patient.id);
  }

  const elapsedSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

  return (
    <div className="view">
      <header className="view__header">
        <h1>Doctor Console</h1>
        <p className="muted">History first, then dictate. Warnings inform — they never block.</p>
      </header>

      <section className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field field--small">
          <label>Doctor name</label>
          <input value={doctorName} onChange={(e) => onDoctorIdentityChange({ doctorName: e.target.value, doctorRegNo })} />
        </div>
        <div className="field field--small">
          <label>Registration no.</label>
          <input value={doctorRegNo} onChange={(e) => onDoctorIdentityChange({ doctorName, doctorRegNo: e.target.value })} />
        </div>
        <form onSubmit={handleLookup} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 220 }}>
          <input placeholder="Patient phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn btn--secondary" type="submit">Load patient</button>
        </form>
      </section>

      {error && <p className="form-error">{error}</p>}

      {!patient && <section className="card"><p className="muted">No patient loaded. Send one from the Desk, or look up by phone above.</p></section>}

      {patient && (
        <>
          <section className="card history-panel">
            <h2>{patient.name} <span className="muted small">· {patient.age}{patient.gender} · {patient.language.toUpperCase()} · {patient.messageFormat}</span></h2>
            <p>{history?.summary}</p>
            {patient.allergies.length > 0 && (
              <p className="form-error" style={{ fontWeight: 700 }}>⚠ ALLERGIES: {patient.allergies.join(', ')}</p>
            )}
            {history?.currentMedications?.length > 0 && (
              <p className="muted small">Current medicines: {history.currentMedications.map((m) => m.raw).join('; ')}</p>
            )}
            <details>
              <summary className="muted small" style={{ cursor: 'pointer' }}>Past visits ({history?.encounters.length || 0})</summary>
              <ul className="visit-list">
                {history?.encounters.map((e) => (
                  <li key={e.id} className="visit-list__item">
                    <div>
                      <strong>{new Date(e.created_at).toLocaleDateString()}</strong>
                      <div className="muted small">{e.diagnosis} — {e.medications.map((m) => m.raw).join(', ')}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {!approved && (
            <>
              <section className="card">
                <h2>One-tap templates</h2>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {TEMPLATES.map((t) => (
                    <button key={t.label} className="btn btn--secondary btn--sm" onClick={() => applyTemplate(t)}>{t.label}</button>
                  ))}
                </div>
              </section>

              <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); handleDraft(); }}>
                <div className="field field--full">
                  <label>Chief complaint / findings <MicButton language={patient.language} sarvamConfigured={config.sarvamConfigured} onTranscript={append('chiefComplaint')} /></label>
                  <textarea rows={2} value={consult.chiefComplaint} onChange={set('chiefComplaint')} />
                </div>
                <div className="field field--full">
                  <label>Diagnosis <MicButton language={patient.language} sarvamConfigured={config.sarvamConfigured} onTranscript={append('diagnosis')} /></label>
                  <textarea rows={2} value={consult.diagnosis} onChange={set('diagnosis')} />
                </div>
                <div className="field field--small"><label>BP</label><input value={consult.bp} onChange={set('bp')} placeholder="120/80" /></div>
                <div className="field field--small"><label>Pulse</label><input value={consult.pulse} onChange={set('pulse')} /></div>
                <div className="field field--small"><label>Temp (°C)</label><input value={consult.tempC} onChange={set('tempC')} /></div>
                <div className="field field--small"><label>Weight (kg)</label><input value={consult.weightKg} onChange={set('weightKg')} /></div>

                <div className="field field--full">
                  <label>Medicines — one per line, e.g. "Paracetamol 500 TDS 3 days" <MicButton language={patient.language} sarvamConfigured={config.sarvamConfigured} onTranscript={append('medicationLines')} /></label>
                  <textarea rows={3} value={consult.medicationLines} onChange={set('medicationLines')} />
                  <div className="muted small" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.3rem' }}>
                    Missing duration? Quick-pick for the last line:
                    {DURATION_PICKS.map((d) => (
                      <button key={d} type="button" className="btn btn--secondary btn--sm" onClick={() => appendDuration(d)}>{d}d</button>
                    ))}
                  </div>
                </div>

                <div className="field field--full">
                  <label>Advice for the patient (rest, diet, etc.) <MicButton language={patient.language} sarvamConfigured={config.sarvamConfigured} onTranscript={append('adviceNotes')} /></label>
                  <textarea rows={2} value={consult.adviceNotes} onChange={set('adviceNotes')} placeholder="Take medicines as prescribed, rest, and drink plenty of fluids." />
                </div>

                <div className="field field--full form-actions">
                  <button className="btn btn--primary" type="submit" disabled={drafting}>
                    {drafting ? 'Checking…' : 'Draft report'}
                  </button>
                </div>
              </form>

              {draft && (
                <section className="card">
                  <h2>Review {draft.warnings.length === 0 && <span className="badge badge--synced">No warnings — one-tap Approve</span>}</h2>

                  <h3 className="muted small">Normalized</h3>
                  <p className="small">{draft.normalizedComplaint}. {draft.normalizedDiagnosis}</p>

                  <h3 className="muted small">Structured medicines</h3>
                  <ul className="visit-list">
                    {draft.medications.map((m, i) => (
                      <li key={i} className="visit-list__item">
                        <div>
                          <strong>{m.genericName || m.raw}</strong>
                          <div className="muted small">
                            {m.doseMg ? `${m.doseMg} mg` : '—'} · {m.frequencyToken || 'frequency?'} · {m.durationDays ? `${m.durationDays} days` : 'duration?'}
                          </div>
                        </div>
                        {m.unmatched && <span className="badge badge--pending">unmatched</span>}
                      </li>
                    ))}
                  </ul>

                  {draft.warnings.length > 0 && (
                    <>
                      <h3 className="muted small">Warnings — informational, not a block</h3>
                      <ul className="visit-list">
                        {[...draft.warnings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).map((w, i) => (
                          <li key={i} className="visit-list__item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
                            <div>
                              <span className={`badge badge--${w.severity === 'major' ? 'pending' : 'scanned-only'}`}>{w.severity}</span>{' '}
                              <strong>{w.medicine}</strong>
                              <div className="small">{w.message}</div>
                            </div>
                            {w.severity === 'major' && (
                              <input
                                placeholder="Reason to proceed (required for major warnings)"
                                value={overrideReasons[w.message] || ''}
                                onChange={(e) => setOverrideReasons((r) => ({ ...r, [w.message]: e.target.value }))}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div className="form-actions">
                    <button className="btn btn--primary" onClick={handleApprove} disabled={approving || unresolvedMajor.length > 0}>
                      {approving ? 'Approving…' : 'Approve & sign'}
                    </button>
                    {unresolvedMajor.length > 0 && (
                      <span className="form-error small">Add a reason for each major warning to proceed.</span>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {approved && (
            <>
              <section className="card">
                <p className="form-notice">Approved and signed ✓</p>
                {elapsedSeconds != null && <p className="muted small">Time in console: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s (unvalidated demo timing, not a claimed time saving)</p>}
                {approved.translation?.mock && <p className="muted small">{approved.translation.note}</p>}
                {approved.whatsapp && <p className="muted small">WhatsApp: {approved.whatsapp.status}{approved.whatsapp.note ? ` — ${approved.whatsapp.note}` : ''}</p>}
                <button className="btn btn--secondary" onClick={startNewVisit}>Start next visit for this patient</button>
              </section>
              <PrintableReport encounter={approved.encounter} patient={patient} doctorName={doctorName} doctorRegNo={doctorRegNo} />
            </>
          )}
        </>
      )}
    </div>
  );
}
