# Sethu — client

Offline-first React PWA for PHC staff (log a visit, generate a QR referral
card) and CHC doctors (scan the card, see history instantly). See the
[root README](../README.md) for the full picture.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

Set `VITE_API_BASE` (defaults to `http://localhost:4000`) if the central
store isn't running on the default port — see `.env.example`.

## Layout

- `src/lib/db.js` — IndexedDB-backed local store for visits (the offline queue)
- `src/lib/qr.js` — builds the self-contained referral payload, encodes/decodes
  it to/from a QR, and reads QR codes from uploaded images
- `src/lib/sync.js` — background sync engine: pushes queued visits to the
  central store whenever the browser is online
- `src/views/PhcView.jsx` — log a visit, view/download the generated QR
- `src/views/ChcView.jsx` — scan a QR (camera or uploaded image), see history
