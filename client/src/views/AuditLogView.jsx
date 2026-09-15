import { useEffect, useState } from 'react';
import { careApi } from '../lib/careApi';

const ENTITY_FILTERS = [
  { value: '', label: 'All' },
  { value: 'patient', label: 'Patients' },
  { value: 'encounter', label: 'Encounters' },
  { value: 'indent', label: 'Indents' },
];

function safeParse(detail) {
  try {
    return JSON.parse(detail || '{}');
  } catch {
    return {};
  }
}

/** Turn one audit row into a plain-English sentence — this is the whole point
 * of the view: task.md's "everything is logged" claim, made readable. */
function describeEntry(entry) {
  const d = safeParse(entry.detail);
  const who = entry.actor || 'system';

  if (entry.entity === 'patient' && entry.action === 'register') {
    return `${who} registered patient ${d.name || entry.entity_id} (${d.phone || 'no phone'}).`;
  }
  if (entry.entity === 'patient' && entry.action === 'whatsapp-consent') {
    return `${who} recorded WhatsApp opt-in (QR scan simulated) for this patient.`;
  }
  if (entry.entity === 'encounter' && entry.action === 'approve') {
    const warnCount = d.warnings?.length || 0;
    const overrideCount = d.overrideReasons?.length || 0;
    const bits = [`${who} approved and signed the consultation.`];
    if (warnCount > 0) bits.push(`${warnCount} warning(s) were flagged, ${overrideCount} with a doctor's reason.`);
    bits.push(d.geminiUsed ? 'Patient advice was translated by Gemini.' : 'Patient advice used the English fallback (no Gemini key).');
    return bits.join(' ');
  }
  if (entry.entity === 'encounter' && entry.action === 'whatsapp-queue') {
    return `WhatsApp voice note ${d.ttsMock ? 'could not be generated (no Sarvam key — mocked)' : 'was generated and queued'}.`;
  }
  if (entry.entity === 'indent' && entry.action === 'draft') {
    return `Agent drafted an indent for ${d.qty ?? '?'} unit(s) of ${d.medicineId || 'a medicine'}.`;
  }
  if (entry.entity === 'indent' && entry.action === 'approve') {
    return `${who} approved the indent for ${d.qty ?? '?'} unit(s) — sent to the CHC inbox.`;
  }
  if (entry.entity === 'indent' && entry.action === 'reject') {
    return `${who} rejected the indent${d.reason ? `: "${d.reason}"` : '.'}`;
  }
  return `${who} — ${entry.action} on ${entry.entity} #${entry.entity_id}.`;
}

export default function AuditLogView() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const { entries: rows } = await careApi.audit({ entity: filter || undefined, limit: 200 });
      setEntries(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [filter]);

  return (
    <div className="view">
      <header className="view__header">
        <h1>Audit Trail</h1>
        <p className="muted">
          Every registration, approval, override, and indent decision — who did it, and when.
          Doctor-in-Control Rule 7: the record shows the doctor made the decision.
        </p>
      </header>

      <section className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {ENTITY_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`app__nav-link${filter === f.value ? ' app__nav-link--active' : ''}`}
            style={{ color: filter === f.value ? undefined : 'var(--primary-dark)', background: filter === f.value ? undefined : 'var(--primary-light)' }}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
        <button className="btn btn--secondary btn--sm" onClick={refresh} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className="card">
        {entries.length === 0 && !loading && <p className="muted">No audit entries yet.</p>}
        <ul className="audit-list">
          {entries.map((entry) => (
            <li key={entry.id} className="audit-list__item">
              <div className="audit-list__meta">
                <span className={`badge badge--${entry.entity === 'encounter' ? 'synced' : entry.entity === 'indent' ? 'pending' : 'scanned-only'}`}>
                  {entry.entity} #{entry.entity_id}
                </span>
                <span className="muted small">{new Date(entry.ts).toLocaleString()}</span>
              </div>
              <p>{describeEntry(entry)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
