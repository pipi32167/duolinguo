import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { env } from '../env.js'

fs.mkdirSync(env.dataDir, { recursive: true })

export const db = new Database(path.join(env.dataDir, 'lingo.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const SCHEMA = `
-- runtime-editable settings (AI baseurl / apikey / model live here)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  nickname       TEXT NOT NULL DEFAULT '学习者',
  avatar_char    TEXT NOT NULL DEFAULT '学',
  lang           TEXT NOT NULL DEFAULT 'en',
  lang_label     TEXT NOT NULL DEFAULT '英语',
  daily_goal_min INTEGER NOT NULL DEFAULT 10,
  created_at     INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hearts            INTEGER NOT NULL DEFAULT 5,
  hearts_refill_at  INTEGER NOT NULL DEFAULT 0,
  gems              INTEGER NOT NULL DEFAULT 340,
  xp                INTEGER NOT NULL DEFAULT 0,
  streak            INTEGER NOT NULL DEFAULT 0,
  longest_streak    INTEGER NOT NULL DEFAULT 0,
  last_lesson_day   TEXT,
  tutor_seconds     INTEGER NOT NULL DEFAULT 0,
  tutor_day         TEXT,
  daily_seconds     INTEGER NOT NULL DEFAULT 0,
  daily_lessons     INTEGER NOT NULL DEFAULT 0,
  daily_day         TEXT,
  best_combo        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  provider   TEXT,
  model      TEXT,
  status     TEXT NOT NULL DEFAULT 'ok',
  error      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id     TEXT REFERENCES images(id) ON DELETE SET NULL,
  text         TEXT NOT NULL,
  norm         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'word',
  translation  TEXT NOT NULL DEFAULT '',
  phonetic     TEXT,
  pos          TEXT,
  example      TEXT,
  example_zh   TEXT,
  topic        TEXT,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  -- FSRS-4.5 spaced repetition state
  srs_state    TEXT NOT NULL DEFAULT 'new',
  stability    REAL NOT NULL DEFAULT 0,
  difficulty   REAL NOT NULL DEFAULT 0,
  due_at       INTEGER NOT NULL DEFAULT 0,
  last_review  INTEGER,
  reps         INTEGER NOT NULL DEFAULT 0,
  lapses       INTEGER NOT NULL DEFAULT 0,
  step         INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_user_norm ON items(user_id, norm);
CREATE INDEX IF NOT EXISTS idx_items_due ON items(user_id, due_at);

CREATE TABLE IF NOT EXISTS lessons (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  unit_label   TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'unit',
  status       TEXT NOT NULL DEFAULT 'ready',
  provider     TEXT,
  model        TEXT,
  error        TEXT,
  xp           INTEGER NOT NULL DEFAULT 0,
  accuracy     REAL,
  duration_ms  INTEGER,
  created_at   INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_lessons_user ON lessons(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS exercises (
  id          TEXT PRIMARY KEY,
  lesson_id   TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES items(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  answer      TEXT NOT NULL,
  order_idx   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exercises_lesson ON exercises(lesson_id, order_idx);

CREATE TABLE IF NOT EXISTS review_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  ms          INTEGER NOT NULL DEFAULT 0,
  prev_state  TEXT NOT NULL,
  next_state  TEXT NOT NULL,
  prev_s      REAL NOT NULL,
  next_s      REAL NOT NULL,
  prev_due    INTEGER NOT NULL,
  next_due    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_user ON review_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tutor_messages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tutor_user ON tutor_messages(user_id, created_at);
`

db.exec(SCHEMA)

export function setting(key: string): string | null {
  const row = db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, Date.now())
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}
