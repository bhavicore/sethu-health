# Sethu

**Offline-first digital health records for rural India.**

Tamil/Sanskrit for *bridge*. When a patient is referred from a rural Primary
Health Centre (PHC) to a Community Health Centre (CHC), their history
usually doesn't travel with them — paper registers, loose slips, and family
memory don't survive the handoff. Sethu closes that gap: a PHC worker logs
the visit and hands the patient a QR **referral card**; the receiving CHC
doctor scans it and sees the full history instantly — no login, no internet
required at either end.

This repo is a working build of the product described in the pitch deck:
a client PWA and a central store, wired together the way the deck's
architecture slide describes.

## How it works

1. **PHC visit.** Staff log symptoms, diagnosis, medication, and allergies in
   the app. The record is written to the device's local database first —
   nothing waits on a network call.
2. **Referral card generated.** Sethu compiles the visit into a compact,
   compressed payload and encodes it as a QR code. The QR is
   self-contained: everything needed to read it back is inside the code
   itself, so decoding never depends on a server lookup.
3. **Patient travels.** The QR card travels on paper or phone. No connectivity
   needed while in transit.
4. **CHC scans.** The receiving doctor scans the code (camera or an uploaded
   image) and the full visit history renders immediately — offline, no
   login.
5. **Sync.** Whenever either device regains connectivity, its local queue of
   visits pushes to the central store in the background. Nothing is lost if
   a PHC or CHC is offline for hours or days; the sync is idempotent, so a
   retried push never creates duplicates.

Where a patient has an ABHA ID, it rides along in the referral card and the
central store exposes a linkage check against India's national health
infrastructure (ABDM). Where they don't, the QR card still works — it's the
fallback that never depends on registration or connectivity.

## Architecture

```
 PHC — Sethu Client                              CHC — Doctor View
 ┌─────────────────────┐        QR Referral       ┌─────────────────────┐
 │ Log visit            │ ───── Card (offline) ──▶│ Scan QR              │
 │ Local-first storage  │                          │ Instant history view │
 │ (IndexedDB)           │                          │ No login required    │
 └─────────┬─────────────┘                          └─────────┬─────────────┘
           │  Local Queue + Background Sync Engine             │
           │  (queues on-device, syncs the moment a             │
           │   network is available — from either end)          │
           ▼                                                     ▼
                    ┌────────────────────────────┐
                    │   Central Data Store        │
                    │   (Express + SQLite)        │
                    └──────────────┬───────────────┘
                                   │ optional, auto-linked when
                                   │ an ABHA ID is present
                                   ▼
                    ABDM / ABHA — National Health Infrastructure
                    (mocked in this build — see below)
```

## Repo layout

- `client/` — React + Vite PWA. PHC and CHC views, IndexedDB-backed offline
  storage, QR generation/scanning, and the background sync engine. See
  [`client/README.md`](client/README.md).
- `server/` — Express + SQLite central store. Accepts synced visits
  idempotently, exposes an ABHA linkage check and a patient lookup. See
  [`server/README.md`](server/README.md).

## Running it

```bash
# Terminal 1 — central store
cd server
npm install
npm start            # http://localhost:4000

# Terminal 2 — client
cd client
npm install
npm run dev          # http://localhost:5173
```

Open the client, pick **PHC Staff** to log a visit and generate a referral
card, or **CHC Doctor** to scan one. Both roles work with the server
stopped — that's the point — and will drain their local sync queue
automatically once it's running.

## What's real vs. mocked

- **Real:** local-first storage, QR encode/decode (both camera and image
  upload), the background sync engine and its idempotent server-side
  upsert, the central store's REST API.
- **Mocked:** the ABDM/ABHA linkage endpoint (`GET /api/abha/:abhaId/link`)
  simulates a plausibility check rather than calling the live ABDM sandbox,
  since that requires registered facility credentials this build doesn't
  have. The integration point is real; the upstream call is stubbed.
