import { useEffect, useState } from 'react';
import { careApi } from '../lib/careApi';

const STATUS_BADGE = { OK: 'synced', Low: 'pending', Reorder: 'pending', 'Near expiry': 'pending' };

export default function InventoryView({ facilityId = 'phc-1' }) {
  const [inventory, setInventory] = useState([]);
  const [drafting, setDrafting] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editedQty, setEditedQty] = useState('');
  const [approvedBy, setApprovedBy] = useState('Dr. MO Kannan');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function refresh() {
    const { inventory: rows } = await careApi.inventory(facilityId);
    setInventory(rows);
  }

  useEffect(() => { refresh(); }, [facilityId]);

  async function openDraft(medicineId) {
    setError(null);
    setDrafting(medicineId);
    setDraft(null);
    try {
      const d = await careApi.draftIndent(facilityId, medicineId);
      setDraft(d);
      setEditedQty(String(d.qty));
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendIndent() {
    setError(null);
    try {
      const { indent } = await careApi.createIndent({
        fromFacility: draft.fromFacility,
        toFacility: draft.toFacility,
        medicineId: draft.medicineId,
        qty: Number(editedQty),
        justification: draft.justification,
        surgeFlag: draft.surgeFlag,
      });
      await careApi.approveIndent(indent.id, { approvedBy, qty: Number(editedQty) });
      setNotice(`Indent for ${draft.medicineId} sent to ${draft.toFacility}.`);
      setDraft(null);
      setDrafting(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="view">
      <header className="view__header">
        <h1>Inventory — {facilityId}</h1>
        <p className="muted">Daily use = max(7-day, 90-day avg) × seasonal multiplier. Plain arithmetic, not an LLM.</p>
      </header>

      {notice && <p className="form-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="card">
        <table className="report-table">
          <thead>
            <tr>
              <th>Medicine</th><th>Stock</th><th>Days left</th><th>Status</th><th>Surge</th><th>Near expiry</th><th></th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((row) => (
              <tr key={row.medicine.id}>
                <td>{row.medicine.generic_name}<div className="muted small">{row.medicine.unit_label}</div></td>
                <td>{row.currentStock}</td>
                <td>{Number.isFinite(row.daysOfStockLeft) ? row.daysOfStockLeft.toFixed(1) : '—'}</td>
                <td><span className={`badge badge--${STATUS_BADGE[row.status] || 'synced'}`}>{row.status}</span></td>
                <td>{row.surgeFlag ? '⚠ surge' : '—'}</td>
                <td>{row.hasNearExpiry ? `${row.nearExpiryBatches.length} batch(es)` : '—'}</td>
                <td>
                  {(row.status === 'Reorder' || row.status === 'Low') && (
                    <button className="btn btn--secondary btn--sm" onClick={() => openDraft(row.medicine.id)}>Draft indent</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {drafting && draft && (
        <section className="card">
          <h2>Indent draft — {draft.medicineId}</h2>
          <p className="small">{draft.justification}{draft.justificationMock && <span className="muted"> (template note — set GEMINI_API_KEY for a model-written note)</span>}</p>
          <div className="field field--small">
            <label>Quantity (editable before approval)</label>
            <input value={editedQty} onChange={(e) => setEditedQty(e.target.value)} />
          </div>
          <div className="field field--small">
            <label>Approved by (Medical Officer)</label>
            <input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={sendIndent}>Approve &amp; send to {draft.toFacility}</button>
            <button className="btn btn--secondary" onClick={() => { setDraft(null); setDrafting(null); }}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}
