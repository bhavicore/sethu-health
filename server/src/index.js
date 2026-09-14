import express from 'express';
import cors from 'cors';
import { upsertVisit, findVisitsByAbha, listRecentVisits } from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'sethu-central-store' });
});

// Central Data Store: PHC and CHC clients push their local queue here once online.
// Idempotent by localId so retried syncs never create duplicates.
app.post('/api/sync', (req, res) => {
  const { visits } = req.body || {};
  if (!Array.isArray(visits)) {
    return res.status(400).json({ error: 'Expected { visits: [...] }' });
  }

  const accepted = [];
  for (const visit of visits) {
    if (!visit.localId) continue;
    const serverId = upsertVisit(visit);
    accepted.push({ localId: visit.localId, serverId });
  }

  res.json({ accepted });
});

// Mock ABDM/ABHA linkage check. Real ABDM sandbox credentials are out of scope here;
// this simulates the "auto-linked when ABHA ID present" behaviour from the architecture.
app.get('/api/abha/:abhaId/link', (req, res) => {
  const { abhaId } = req.params;
  const looksValid = /^\d{2}-?\d{4}-?\d{4}-?\d{4}$|^\d{14}$/.test(abhaId);
  res.json({
    abhaId,
    linked: looksValid,
    mock: true,
    note: 'Simulated ABDM linkage — no live ABDM sandbox connection in this build.',
  });
});

// Fallback lookup for a CHC that IS online and wants to cross-check the central store
// by ABHA ID, in addition to reading the self-contained QR payload.
app.get('/api/patients/:abhaId', (req, res) => {
  const visits = findVisitsByAbha(req.params.abhaId);
  res.json({ abhaId: req.params.abhaId, visits });
});

app.get('/api/visits', (req, res) => {
  res.json({ visits: listRecentVisits(Number(req.query.limit) || 100) });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Sethu central store listening on http://localhost:${PORT}`);
});
