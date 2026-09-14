# Sethu — server

Express + SQLite (via `better-sqlite3`). Two things live here: the original
referral-sync API, and the consultation/inventory API for Loop 1 and Loop 2.
See the [root README](../README.md) for the full picture.

## Run

```bash
npm install
cp .env.example .env    # optional — see below
npm run start:env       # http://localhost:4000, loads .env if present
npm run dev:env         # same, with --watch
# or just `npm start` / `npm run dev` if you export env vars yourself
```

Demo data (facilities, medicines, patients, inventory, 90-day usage history)
is seeded automatically on first run — see `src/seed.js`. Data is stored in
`sethu.db` (SQLite, created on first run, git-ignored).

## Optional environment variables

None of these are required — the demo runs fully without them. See
`.env.example`.

| Variable | Enables |
|---|---|
| `SARVAM_API_KEY` | Saaras speech-to-text (dictation mic buttons), Bulbul text-to-speech (WhatsApp voice notes) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Patient-advice rewording into Hindi/Tamil, indent justification notes |
| `WHATSAPP_CLOUD_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Actually sending the queued WhatsApp messages (otherwise they're queued and logged, not delivered) |

## API — referral bridge (original demo)

- `GET /api/health` — liveness check
- `POST /api/sync` — body `{ visits: [...] }`; upserts each by `localId`.
- `GET /api/patients/:abhaId` — synced visits for an ABHA ID.
- `GET /api/abha/:abhaId/link` — mocked ABDM linkage check.
- `GET /api/visits?limit=100` — recent visits, most-recent first.

## API — consultation & inventory (`/api/care/*`)

**Facilities & reference data**
- `GET /api/care/facilities`, `GET /api/care/medicines`, `GET /api/care/config`

**Patients (Task 3.1)**
- `POST /api/care/patients/register`
- `GET /api/care/patients/lookup?phone=...`
- `POST /api/care/patients/:id/whatsapp-consent` — simulates the QR-code opt-in
- `GET /api/care/patients/:id/history` — history + deterministic summary

**Speech-to-text (Task 2.1)**
- `POST /api/care/stt` — body `{ audioBase64, mimeType, language }`

**Encounters (Task 3.1 + 3.2 alerts)**
- `POST /api/care/encounters/draft` — normalize + structure + CDSS checks,
  nothing persisted yet
- `POST /api/care/encounters/approve` — persists, deducts stock, generates
  patient advice, queues WhatsApp, logs everything
- `GET /api/care/encounters/:id`

**Inventory & indents (Task 4.2)**
- `GET /api/care/inventory/:facilityId` — status per medicine (OK/Low/Reorder/Near expiry)
- `POST /api/care/inventory/:facilityId/indents/draft` — formula-based calc + Gemini note
- `POST /api/care/indents`, `GET /api/care/indents?facility=...&direction=incoming|outgoing`
- `POST /api/care/indents/:id/approve`, `POST /api/care/indents/:id/reject`

**Audit (Doctor-in-Control Rule 7)**
- `GET /api/care/audit?entity=...&entityId=...`

## Code layout

- `src/clinical/normalize.js` — abbreviation expansion + brand→generic +
  medication-line parsing (deterministic, no LLM)
- `src/clinical/rules.js` — allergy/interaction/dose-limit/missing-detail/stock
  checks (deterministic)
- `src/clinical/inventory.js` — the reorder-point/indent-quantity/surge-flag
  formulas (deterministic)
- `src/clinical/templates.js` / `summary.js` — fixed Hindi/Tamil dose-schedule
  sentences and the deterministic history summary
- `src/lib/gemini.js`, `src/lib/sarvam.js`, `src/lib/whatsapp.js` — the three
  external integrations, each with a documented fallback when unconfigured
- `src/routes/care.js` — the `/api/care/*` router
- `src/seed.js` — synthetic demo data (see the root README's "Data We Need" section in `task.md`)
