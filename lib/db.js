// SQLite viene dentro de Node 22.5+ (node:sqlite). Cero dependencias para guardar
// el PIN, las sesiones de la docente y el historial de partidas.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS teacher (id INTEGER PRIMARY KEY CHECK (id = 1), pin_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS session (token TEXT PRIMARY KEY, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, label TEXT, n INTEGER, started_at TEXT, finished_at TEXT)',
  'CREATE TABLE IF NOT EXISTS answer (game_id INTEGER, q_index INTEGER, q_text TEXT, seat INTEGER, name TEXT, letter TEXT, correct INTEGER, open INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS answer_game ON answer (game_id)',
];

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try { db.prepare('PRAGMA journal_mode = WAL').get(); } catch { /* disco raro: seguimos igual */ }
  for (const s of SCHEMA) db.exec(s);
  // Bases creadas antes de las preguntas abiertas: la columna se agrega una vez.
  try { db.exec('ALTER TABLE answer ADD COLUMN open INTEGER DEFAULT 0'); } catch { /* ya existía */ }

  const now = () => new Date().toISOString();

  const q = {
    insGame: db.prepare('INSERT INTO game (topic, label, n, started_at) VALUES (?, ?, ?, ?)'),
    finGame: db.prepare('UPDATE game SET finished_at = ? WHERE id = ?'),
    insAns: db.prepare('INSERT INTO answer (game_id, q_index, q_text, seat, name, letter, correct, open) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    getTeacher: db.prepare('SELECT * FROM teacher WHERE id = 1'),
    setTeacher: db.prepare('INSERT INTO teacher (id, pin_hash, salt, created_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash, salt = excluded.salt'),
    delTeacher: db.prepare('DELETE FROM teacher'),
    insSession: db.prepare('INSERT OR REPLACE INTO session (token, created_at) VALUES (?, ?)'),
    getSession: db.prepare('SELECT token FROM session WHERE token = ?'),
    delSession: db.prepare('DELETE FROM session WHERE token = ?'),
    clearSessions: db.prepare('DELETE FROM session'),
    lastGame: db.prepare('SELECT * FROM game ORDER BY id DESC LIMIT 1'),
    rows: db.prepare('SELECT * FROM answer WHERE game_id = ? ORDER BY seat, q_index'),
  };

  return {
    raw: db,
    startGame({ topic, label, count }) {
      return Number(q.insGame.run(topic, label, count, now()).lastInsertRowid);
    },
    finishGame(id) { if (id) q.finGame.run(now(), id); },
    saveQuestion(gameId, qi, question, players) {
      if (!gameId) return;
      const open = question.open ? 1 : 0;
      for (const p of players.values()) {
        const letter = p.picks[qi] ?? null;
        const hit = !open && letter && letter === question.correct ? 1 : 0;
        q.insAns.run(gameId, qi, question.text, p.seat, p.name, letter, hit, open);
      }
    },
    teacher: () => q.getTeacher.get() ?? null,
    saveTeacher(hash, salt) { q.setTeacher.run(hash, salt, now()); },
    clearTeacher() { q.delTeacher.run(); q.clearSessions.run(); },
    addSession(token) { q.insSession.run(token, now()); },
    hasSession(token) { return Boolean(token && q.getSession.get(token)); },
    dropSession(token) { if (token) q.delSession.run(token); },
    lastGame: () => q.lastGame.get() ?? null,
    answers: (gameId) => q.rows.all(gameId),
  };
}
