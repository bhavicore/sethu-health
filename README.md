# Sethu

**An honest prototype for two connected agent loops in a rural PHC, plus the
original offline referral bridge.**

Tamil/Sanskrit for *bridge*. This repo now covers three things, in order of
how they were built:

1. **Consultation (Loop 1).** A patient registers at the desk. The moment
   they're called in, the doctor's screen already shows their history —
   allergies highlighted, chronic conditions, current medicines, last visit.
   The doctor examines the patient directly (never recorded) and dictates
   findings, diagnosis, and medicines. The agent normalizes the dictation,
   checks it against the patient's history and the PHC's stock, and drafts a
   report with any allergy conflicts, drug interactions, dose issues, or
   missing details flagged — as warnings, never blocks. The doctor edits and
   approves; only then is anything final. The signed printout carries the
   advice in the patient's language (Hindi/Tamil), and voice-preference
   patients also get a WhatsApp voice note.
2. **Inventory (Loop 2).** Every approved prescription deducts PHC stock. A
   plain formula — not an LLM — tracks how fast each medicine is being used,
   flags a monsoon-style surge, and drafts a requisition (indent) to the CHC
   before the PHC actually runs out. The Medical Officer approves or edits
   the indent before anything is sent; the CHC sees it in an inbox.
3. **Referral bridge (the original demo).** When a patient is referred from a
   PHC to a CHC, Sethu compiles the visit into a compressed, self-contained
   QR code — no login, no connectivity needed at either end.

This is a **synthetic-data prototype**, not a validated clinical system — see
[Limits](#limits) below and `task.md` for the full roadmap this demo is a
slice of.

## How Loop 1 works

1. **Registration** (desk): name, age, phone, language, message format
   (text/voice/both). First-time patients are asked about allergies.
   Voice-preference patients scan a WhatsApp QR code, opening the 24-hour
   messaging window.
2. **History, instantly** (doctor console): allergies (highlighted), chronic
   conditions, current medicines, past visits, last vitals, and a short
   deterministic summary. Allergies and medicines are shown exactly as
   recorded — never inferred.
3. **Dictation**: chief complaint, diagnosis, and medicines (one per line,
   e.g. `Paracetamol 500 TDS 3 days`). Optional voice input via Sarvam Saaras
   if `SARVAM_API_KEY` is set; otherwise the doctor types.
4. **Draft & check**: the agent expands abbreviations (TDS, BD, 1-0-1, …),
   maps brand names to generics (Dolo 650 → paracetamol), and checks the
   draft against the patient's allergies, a small drug-interaction table,
   dose ceilings, missing details, and PHC stock.
5. **Review & approve**: warnings are shown, but never block. A major
   warning (like an allergy conflict) asks the doctor for a short reason
   before Approve is enabled — the reason is logged, not enforced.
6. **Signed report**: printable, with the doctor's name and registration
   number, the report/prescription in English, a patient-language section
   with a morning/afternoon/night dose schedule (fixed templates, never
   LLM-generated), and a signature line.
7. **After approval**: stock is deducted, the visit is added to history,
   voice-preference patients get a WhatsApp voice note + text summary, and
   every step is logged to the audit trail.

## How Loop 2 works

- Inventory screens (PHC and CHC) show each medicine's stock, days of stock
  left, and status (OK / Low / Reorder / Near expiry).
- `daily use = max(7-day avg, 90-day avg)` — so a surge is caught fast —
  `× seasonal multiplier` (set per medicine by the Medical Officer, e.g. ORS
  ×1.5 in June–September). `reorder point = adjusted daily use × lead time +
  safety stock`. `indent quantity = adjusted daily use × cycle days − current
  stock`. All arithmetic, no LLM.
- A surge flag fires when the 7-day average exceeds 1.5× the 90-day average.
- Gemini (if configured) writes a one-sentence justification note for the
  indent; every number in it comes from the formula above.
- The PHC Medical Officer approves or edits the quantity before it's sent;
  the CHC sees it in an inbox.

## Architecture

```
 Desk → Doctor Console (Loop 1)              PHC/CHC Inventory (Loop 2)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Register / lookup patient  │                │ Stock + 90-day usage       │
 │ History on screen          │──approve──────▶│ history per medicine      │
 │ Dictate → draft → warnings │  (deduct stock) │ Formula-based reorder     │
 │ Doctor approves & signs    │                │ Gemini-worded indent note │
 └──────────────┬──────────────┘                └──────────────┬──────────────┘
                │ printable report + WhatsApp (mocked send)      │ HITL approval
                ▼                                                ▼
        Patient (their language)                          CHC inbox

 PHC — Sethu Client (referral bridge)            CHC — Doctor View
 ┌─────────────────────┐        QR Referral       ┌─────────────────────┐
 │ Log visit            │ ───── Card (offline) ──▶│ Scan QR              │
 │ Local-first storage  │                          │ Instant history view │
 └───────────┬───────────┘                          └───────────┬───────────┘
             │  Local Queue + Background Sync Engine             │
             ▼                                                     ▼
                      ┌────────────────────────────┐
                      │   Central Store (server/)   │
                      │   Express + SQLite           │
                      └────────────────────────────┘
```

## Repo layout

- `client/` — React + Vite PWA. Desk, Doctor Console, Inventory, and CHC
  views for Loop 1/2, plus the original PHC/CHC referral views. See
  [`client/README.md`](client/README.md).
- `server/` — Express + SQLite. Clinical rules engine, inventory formulas,
  Gemini/Sarvam wrappers (both optional, with graceful fallback), and the
  original referral-sync API. See [`server/README.md`](server/README.md).

## Running it

```bash
# Terminal 1 — central store
cd server
npm install
cp .env.example .env   # optional: add SARVAM_API_KEY / GEMINI_API_KEY here
npm run start:env      # http://localhost:4000, loads .env if present
# (plain `npm start` also works if you'd rather export env vars yourself)

# Terminal 2 — client
cd client
npm install
npm run dev             # http://localhost:5173
```

Demo data is seeded automatically on first server start: two facilities
(`phc-1`, `chc-1`), 10 NLEM medicines, a hand-built interaction/allergy table,
four synthetic patients (one with a penicillin allergy — phone
`9800000001`), 90 days of usage history with a built-in ORS monsoon surge,
and stock levels tuned so ORS is about to run out and one cetirizine batch
is near expiry.

**A scripted walkthrough:** Desk → register or look up `9800000001` (Lakshmi
Raman) → Send to Doctor → dictate `Amoxicillin 500 BD` as the medicine → the
draft flags a penicillin allergy conflict and a missing duration → give a
one-line reason → Approve → the printed report carries the Tamil advice and
dose schedule. Then check Inventory → ORS shows **Reorder** with a surge
flag → Draft indent → Approve & send → switch to CHC → Indent Inbox to see
it arrive.

## What's real vs. mocked

- **Real:** the clinical rules engine (allergy/interaction/dose/missing-detail/
  stock checks), abbreviation and brand→generic normalization, the
  inventory reorder formulas and surge detection, stock deduction on
  approval, the audit trail, the printable signed report, and (from the
  original demo) local-first storage, QR encode/decode, and the background
  sync engine.
- **Optional, with graceful fallback:** Sarvam Saaras (speech-to-text) and
  Bulbul (text-to-speech) — without `SARVAM_API_KEY`, doctors type dictation
  and no voice notes are generated. Gemini — without `GEMINI_API_KEY`,
  patient advice is shown in English unchanged and indent justifications use
  a plain template sentence instead of a model-written one. Dose schedules
  and warning-sign sentences are **always** fixed templates, never the
  model, regardless of key configuration.
- **Mocked (integration point is real, upstream call is stubbed):** the
  Meta WhatsApp Cloud API send (messages are queued in `whatsapp_outbox`,
  visible in the audit trail, but not actually delivered without
  `WHATSAPP_CLOUD_API_TOKEN`), and the ABDM/ABHA linkage check from the
  original referral demo.

## Limits

- Built and tested on synthetic data only; not validated with real patients,
  clinicians, or pharmacists. The Hindi/Tamil sentence templates and the
  ~20-pair interaction table need native-speaker and clinician review before
  any real use.
- The consultation and inventory API calls need connectivity (they run the
  rules engine and, optionally, Sarvam/Gemini server-side); only
  registration, lookup, and the original referral flow are fully
  offline-first in this build. Local on-device speech-to-text is future
  work — see `task.md`.
- Inventory is not a replacement for e-Aushadhi / DVDMS / TNMSC; it shows the
  agent layer that could sit on top of them.
- Doctor-console timing shown after Approve is unvalidated demo
  instrumentation, not a claimed time saving — see `task.md`'s review-feedback
  table for what a real time-and-motion study would need.
