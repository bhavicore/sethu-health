import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SETHU_DB_PATH || path.join(__dirname, '..', 'sethu.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    server_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    local_id      TEXT UNIQUE NOT NULL,
    name          TEXT,
    age           TEXT,
    gender        TEXT,
    abha_id       TEXT,
    facility      TEXT,
    symptoms      TEXT,
    diagnosis     TEXT,
    medications   TEXT,
    allergies     TEXT,
    notes         TEXT,
    created_at    TEXT,
    received_at   TEXT NOT NULL DEFAULT (datetime('now')),
    origin        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_visits_abha ON visits (abha_id);
`);

const insertStmt = db.prepare(`
  INSERT INTO visits (
    local_id, name, age, gender, abha_id, facility,
    symptoms, diagnosis, medications, allergies, notes, created_at, origin
  ) VALUES (
    @localId, @name, @age, @gender, @abhaId, @facility,
    @symptoms, @diagnosis, @medications, @allergies, @notes, @createdAt, @origin
  )
  ON CONFLICT(local_id) DO NOTHING
`);

const findByLocalIdStmt = db.prepare('SELECT server_id FROM visits WHERE local_id = ?');
const findByAbhaStmt = db.prepare('SELECT * FROM visits WHERE abha_id = ? ORDER BY received_at DESC');
const listStmt = db.prepare('SELECT * FROM visits ORDER BY received_at DESC LIMIT ?');

/** Upsert-by-localId so a client retrying a sync (e.g. after a dropped connection) never duplicates a visit. */
export function upsertVisit(visit) {
  insertStmt.run({
    localId: visit.localId,
    name: visit.name ?? null,
    age: visit.age != null ? String(visit.age) : null,
    gender: visit.gender ?? null,
    abhaId: visit.abhaId || null,
    facility: visit.facility ?? null,
    symptoms: visit.symptoms ?? null,
    diagnosis: visit.diagnosis ?? null,
    medications: visit.medications ?? null,
    allergies: visit.allergies ?? null,
    notes: visit.notes ?? null,
    createdAt: visit.createdAt ?? null,
    origin: visit.origin ?? 'phc',
  });
  return findByLocalIdStmt.get(visit.localId).server_id;
}

export function findVisitsByAbha(abhaId) {
  return findByAbhaStmt.all(abhaId);
}

export function listRecentVisits(limit = 100) {
  return listStmt.all(limit);
}
