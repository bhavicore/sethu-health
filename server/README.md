# Sethu — server

Central data store the PHC and CHC clients sync to once they have
connectivity. Express + SQLite (via `better-sqlite3`). See the
[root README](../README.md) for the full picture.

## Run

```bash
npm install
npm start        # http://localhost:4000, PORT env var to override
```

Data is stored in `sethu.db` (SQLite, created on first run, git-ignored).

## API

- `GET /api/health` — liveness check
- `POST /api/sync` — body `{ visits: [...] }`; upserts each by `localId`, so
  a retried sync from a client never creates duplicate rows. Returns
  `{ accepted: [{ localId, serverId }, ...] }`.
- `GET /api/patients/:abhaId` — all synced visits for an ABHA ID (used when a
  CHC is online and wants to cross-check the central store in addition to
  reading the QR payload directly).
- `GET /api/abha/:abhaId/link` — mocked ABDM linkage check (see root README
  for why this is stubbed rather than live).
- `GET /api/visits?limit=100` — recent visits, most-recent first.
