import { randomUUID } from 'node:crypto'
import { db } from './index.js'
import { currentRetrievability, forgettingCurve, schedule, type Grade, type SrsState } from '../srs/fsrs.js'

export const HEARTS_MAX = 5
export const HEART_REFILL_MS = 8 * 60 * 60 * 1000
export const TUTOR_FREE_SECONDS = 30 * 60

export interface ItemRow {
  id: string
  user_id: string
  image_id: string | null
  text: string
  norm: string
  type: string
  translation: string
  phonetic: string | null
  pos: string | null
  example: string | null
  example_zh: string | null
  topic: string | null
  note: string | null
  created_at: number
  srs_state: SrsState
  stability: number
  difficulty: number
  due_at: number
  last_review: number | null
  reps: number
  lapses: number
  step: number
}

export interface UserRow {
  id: string
  nickname: string
  avatar_char: string
  lang: string
  lang_label: string
  daily_goal_min: number
  created_at: number
  last_active_at: number
}

export interface StatsRow {
  user_id: string
  hearts: number
  hearts_refill_at: number
  gems: number
  xp: number
  streak: number
  longest_streak: number
  last_lesson_day: string | null
  tutor_seconds: number
  tutor_day: string | null
  daily_seconds: number
  daily_lessons: number
  daily_day: string | null
  best_combo: number
}

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)
const yesterday = (now = Date.now()) => new Date(now - 86_400_000).toISOString().slice(0, 10)

export function ensureUser(deviceId: string): UserRow {
  const existing = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(deviceId)
  const now = Date.now()
  if (existing) {
    db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now, deviceId)
    ensureStats(deviceId)
    return { ...existing, last_active_at: now }
  }
  db.prepare(
    `INSERT INTO users(id, nickname, avatar_char, lang, lang_label, daily_goal_min, created_at, last_active_at)
     VALUES(?, '学习者', '学', 'en', '英语', 10, ?, ?)`,
  ).run(deviceId, now, now)
  ensureStats(deviceId)
  return db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(deviceId)!
}

function ensureStats(userId: string): void {
  const row = db.prepare('SELECT user_id FROM user_stats WHERE user_id = ?').get(userId)
  if (!row) {
    db.prepare('INSERT INTO user_stats(user_id, daily_day, tutor_day) VALUES(?, ?, ?)').run(
      userId,
      today(),
      today(),
    )
  }
}

export function updateUser(userId: string, patch: Partial<UserRow>): UserRow {
  const allowed: (keyof UserRow)[] = ['nickname', 'avatar_char', 'lang', 'lang_label', 'daily_goal_min']
  const sets: string[] = []
  const values: unknown[] = []
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`)
      values.push(patch[key])
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, userId)
  }
  return db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?').get(userId)!
}

/** Read stats, applying lazily-regenerating hearts and daily counter resets. */
export function getStats(userId: string, now = Date.now()): StatsRow {
  ensureStats(userId)
  const row = db.prepare<[string], StatsRow>('SELECT * FROM user_stats WHERE user_id = ?').get(userId)!
  let { hearts, hearts_refill_at: refillAt, gems, xp, streak, longest_streak, daily_seconds, daily_lessons } = row

  while (hearts < HEARTS_MAX && refillAt > 0 && now >= refillAt) {
    hearts += 1
    refillAt += HEART_REFILL_MS
  }
  if (hearts >= HEARTS_MAX) {
    hearts = HEARTS_MAX
    refillAt = 0
  }

  const day = today(now)
  const resetDaily = row.daily_day !== day
  const resetTutor = row.tutor_day !== day
  if (resetDaily || resetTutor || hearts !== row.hearts || refillAt !== row.hearts_refill_at) {
    db.prepare(
      `UPDATE user_stats SET hearts = ?, hearts_refill_at = ?, daily_seconds = ?, daily_lessons = ?,
        daily_day = ?, tutor_seconds = ?, tutor_day = ? WHERE user_id = ?`,
    ).run(
      hearts,
      refillAt,
      resetDaily ? 0 : daily_seconds,
      resetDaily ? 0 : daily_lessons,
      day,
      resetTutor ? 0 : row.tutor_seconds,
      day,
      userId,
    )
  }
  return {
    ...row,
    hearts,
    hearts_refill_at: refillAt,
    gems,
    xp,
    streak,
    longest_streak,
    daily_seconds: resetDaily ? 0 : daily_seconds,
    daily_lessons: resetDaily ? 0 : daily_lessons,
    tutor_seconds: resetTutor ? 0 : row.tutor_seconds,
  }
}

export function spendHeart(userId: string, now = Date.now()): StatsRow {
  const s = getStats(userId, now)
  if (s.hearts <= 0) return s
  const hearts = s.hearts - 1
  const refillAt = s.hearts_refill_at || now + HEART_REFILL_MS
  db.prepare('UPDATE user_stats SET hearts = ?, hearts_refill_at = ? WHERE user_id = ?').run(
    hearts,
    hearts === HEARTS_MAX ? 0 : refillAt,
    userId,
  )
  return getStats(userId, now)
}

export function refillHearts(userId: string, cost: number): { ok: boolean; reason?: string } {
  const s = getStats(userId)
  if (s.gems < cost) return { ok: false, reason: '宝石不足' }
  db.prepare('UPDATE user_stats SET hearts = ?, hearts_refill_at = 0, gems = gems - ? WHERE user_id = ?').run(
    HEARTS_MAX,
    cost,
    userId,
  )
  return { ok: true }
}

export function addGems(userId: string, amount: number): void {
  db.prepare('UPDATE user_stats SET gems = MAX(0, gems + ?) WHERE user_id = ?').run(amount, userId)
}

export function addTutorSeconds(userId: string, seconds: number): void {
  getStats(userId)
  db.prepare('UPDATE user_stats SET tutor_seconds = tutor_seconds + ? WHERE user_id = ?').run(
    seconds,
    userId,
  )
}

/* ------------------------------------------------------------------ items */

export interface NewItem {
  text: string
  norm: string
  type: string
  translation: string
  phonetic?: string
  pos?: string
  example?: string
  example_zh?: string
  topic?: string
  note?: string
}

export function upsertItems(
  userId: string,
  imageId: string | null,
  items: NewItem[],
): { inserted: number; updated: number; ids: string[] } {
  const now = Date.now()
  const find = db.prepare<[string, string], ItemRow>('SELECT * FROM items WHERE user_id = ? AND norm = ?')
  const insert = db.prepare(
    `INSERT INTO items(id, user_id, image_id, text, norm, type, translation, phonetic, pos, example, example_zh, topic, note, created_at, due_at)
     VALUES(@id, @user_id, @image_id, @text, @norm, @type, @translation, @phonetic, @pos, @example, @example_zh, @topic, @note, @created_at, @due_at)`,
  )
  const update = db.prepare(
    `UPDATE items SET translation = ?, phonetic = COALESCE(?, phonetic), pos = COALESCE(?, pos),
       example = COALESCE(?, example), example_zh = COALESCE(?, example_zh), topic = COALESCE(?, topic),
       text = ?, image_id = COALESCE(?, image_id)
     WHERE id = ?`,
  )

  let inserted = 0
  let updated = 0
  const ids: string[] = []
  const run = db.transaction((list: NewItem[]) => {
    for (const item of list) {
      const found = find.get(userId, item.norm)
      if (found) {
        update.run(
          item.translation || found.translation,
          item.phonetic ?? null,
          item.pos ?? null,
          item.example ?? null,
          item.example_zh ?? null,
          item.topic ?? null,
          item.text,
          imageId,
          found.id,
        )
        updated++
        ids.push(found.id)
      } else {
        const id = randomUUID()
        insert.run({
          id,
          user_id: userId,
          image_id: imageId,
          text: item.text,
          norm: item.norm,
          type: item.type,
          translation: item.translation,
          phonetic: item.phonetic ?? null,
          pos: item.pos ?? null,
          example: item.example ?? null,
          example_zh: item.example_zh ?? null,
          topic: item.topic ?? null,
          note: item.note ?? null,
          created_at: now,
          due_at: 0,
        })
        inserted++
        ids.push(id)
      }
    }
  })
  run(items)
  return { inserted, updated, ids }
}

export function getItems(userId: string, ids?: string[]): ItemRow[] {
  if (ids && ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    return db
      .prepare<unknown[], ItemRow>(`SELECT * FROM items WHERE user_id = ? AND id IN (${placeholders})`)
      .all(userId, ...ids)
  }
  return db
    .prepare<[string], ItemRow>('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC, text')
    .all(userId)
}

export function getItem(userId: string, id: string): ItemRow | undefined {
  return db.prepare<[string, string], ItemRow>('SELECT * FROM items WHERE user_id = ? AND id = ?').get(userId, id)
}

export function updateItem(userId: string, id: string, patch: Partial<ItemRow>): ItemRow | undefined {
  const allowed = ['text', 'translation', 'phonetic', 'pos', 'example', 'example_zh', 'topic', 'note', 'type']
  const sets: string[] = []
  const values: unknown[] = []
  for (const key of allowed) {
    if (patch[key as keyof ItemRow] !== undefined) {
      sets.push(`${key} = ?`)
      values.push(patch[key as keyof ItemRow])
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`).run(...values, userId, id)
  }
  return getItem(userId, id)
}

export function deleteItems(userId: string, ids: string[]): number {
  if (!ids.length) return 0
  const placeholders = ids.map(() => '?').join(',')
  const res = db.prepare(`DELETE FROM items WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...ids)
  return res.changes
}

export function resetItemSrs(userId: string, id: string): void {
  db.prepare(
    `UPDATE items SET srs_state='new', stability=0, difficulty=0, due_at=0, last_review=NULL, reps=0, lapses=0, step=0
     WHERE user_id = ? AND id = ?`,
  ).run(userId, id)
}

/* --------------------------------------------------------------- reviewing */

export interface QueueEntry {
  item: ItemRow
  retrievability: number
  reason: 'due' | 'new' | 'weak'
  overdueDays: number
  preview: ReturnType<typeof schedule>[]
}

export function dueCount(userId: string, now = Date.now()): number {
  return (
    db
      .prepare<unknown[], { c: number }>(
        `SELECT COUNT(*) c FROM items WHERE user_id = ? AND srs_state != 'new' AND due_at <= ? AND created_at <= ?`,
      )
      .get(userId, now, now)?.c ?? 0
  )
}

export function newCount(userId: string): number {
  return db
    .prepare<[string], { c: number }>(`SELECT COUNT(*) c FROM items WHERE user_id = ? AND srs_state = 'new'`)
    .get(userId)?.c ?? 0
}

export function buildQueue(userId: string, limit = 20, now = Date.now()): QueueEntry[] {
  const due = db
    .prepare<unknown[], ItemRow>(
      `SELECT * FROM items WHERE user_id = ? AND srs_state != 'new' AND due_at <= ? ORDER BY due_at ASC LIMIT ?`,
    )
    .all(userId, now, limit)
  const fresh = db
    .prepare<unknown[], ItemRow>(
      `SELECT * FROM items WHERE user_id = ? AND srs_state = 'new' ORDER BY created_at ASC LIMIT ?`,
    )
    .all(userId, limit)

  const seen = new Set(due.map((i) => i.id))
  const weak = db
    .prepare<unknown[], ItemRow>(
      `SELECT * FROM items WHERE user_id = ? AND srs_state IN ('review','relearning') AND lapses > 0
       ORDER BY lapses DESC, stability ASC LIMIT ?`,
    )
    .all(userId, limit)
    .filter((i) => !seen.has(i.id))

  const entries: QueueEntry[] = [
    ...due.map((item) => entry(item, 'due', now)),
    ...weak.map((item) => entry(item, 'weak', now)),
    ...fresh.map((item) => entry(item, 'new', now)),
  ]
  return entries.slice(0, limit)
}

function entry(item: ItemRow, reason: QueueEntry['reason'], now: number): QueueEntry {
  return {
    item,
    reason,
    retrievability: reason === 'new' ? 0 : currentRetrievability(item, now),
    overdueDays: item.last_review ? Math.max(0, (now - item.due_at) / 86_400_000) : 0,
    preview: [1, 2, 3, 4].map((g) => schedule(item, g as Grade, now)),
  }
}

export interface ReviewOutcome {
  item: ItemRow
  intervalDays: number
  nextDue: number
  correct: boolean
}

export function applyReview(
  userId: string,
  itemId: string,
  grade: Grade,
  ms = 0,
  now = Date.now(),
): ReviewOutcome | undefined {
  const item = getItem(userId, itemId)
  if (!item) return undefined
  const next = schedule(item, grade, now)
  const correct = grade > 1 ? 1 : 0

  db.prepare(
    `UPDATE items SET srs_state=?, stability=?, difficulty=?, due_at=?, last_review=?, reps=?, lapses=?, step=?
     WHERE user_id = ? AND id = ?`,
  ).run(
    next.srs_state,
    next.stability,
    next.difficulty,
    next.due_at,
    next.last_review,
    next.reps,
    next.lapses,
    next.step,
    userId,
    itemId,
  )

  db.prepare(
    `INSERT INTO review_log(id, user_id, item_id, rating, correct, ms, prev_state, next_state, prev_s, next_s, prev_due, next_due, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    randomUUID(),
    userId,
    itemId,
    grade,
    correct,
    ms,
    item.srs_state,
    next.srs_state,
    item.stability,
    next.stability,
    item.due_at,
    next.due_at,
    now,
  )

  return {
    item: getItem(userId, itemId)!,
    intervalDays: next.intervalDays,
    nextDue: next.due_at,
    correct: correct === 1,
  }
}

export function itemCurve(item: ItemRow, now = Date.now()) {
  return {
    stability: item.stability,
    state: item.srs_state,
    dueAt: item.due_at,
    lastReview: item.last_review,
    retrievability: currentRetrievability(item, now),
    curve: forgettingCurve(item.stability > 0 ? item.stability : 3, { days: 30, samples: 60 }),
    preview: [1, 2, 3, 4].map((g) => schedule(item, g as Grade, now)),
  }
}

export function deckStats(userId: string, now = Date.now()) {
  const rows = getItems(userId)
  const byState = { new: 0, learning: 0, review: 0, relearning: 0 }
  let due = 0
  for (const item of rows) {
    byState[item.srs_state] = (byState[item.srs_state] ?? 0) + 1
    if (item.srs_state !== 'new' && item.due_at <= now) due++
  }
  const reviewed = rows.filter((i) => i.reps > 0)
  const avgRetention =
    reviewed.length === 0
      ? 0
      : reviewed.reduce((acc, i) => acc + currentRetrievability(i, now), 0) / reviewed.length
  return {
    total: rows.length,
    due,
    byState,
    avgRetention,
    mature: rows.filter((i) => i.stability >= 21).length,
    young: rows.filter((i) => i.stability > 0 && i.stability < 21).length,
    fragile: rows.filter((i) => i.lapses > 0).length,
  }
}

export function reviewHeatmap(userId: string, days = 30, now = Date.now()) {
  const from = now - days * 86_400_000
  const rows = db
    .prepare<[string, number], { created_at: number; correct: number }>(
      'SELECT created_at, correct FROM review_log WHERE user_id = ? AND created_at >= ?',
    )
    .all(userId, from)
  const buckets = new Map<string, { total: number; correct: number }>()
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(today(now - i * 86_400_000), { total: 0, correct: 0 })
  }
  for (const row of rows) {
    const key = today(row.created_at)
    const b = buckets.get(key)
    if (b) {
      b.total++
      b.correct += row.correct
    }
  }
  return Array.from(buckets, ([day, v]) => ({ day, ...v }))
}

/* ----------------------------------------------------------------- lessons */

export interface LessonRow {
  id: string
  user_id: string
  title: string
  unit_label: string
  kind: string
  status: string
  provider: string | null
  model: string | null
  error: string | null
  xp: number
  accuracy: number | null
  duration_ms: number | null
  created_at: number
  completed_at: number | null
}

export interface ExerciseRow {
  id: string
  lesson_id: string
  item_id: string | null
  kind: string
  prompt: string
  answer: string
  order_idx: number
}

export function createLesson(
  userId: string,
  lesson: { title: string; unitLabel: string; kind: string; provider?: string; model?: string },
): string {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO lessons(id, user_id, title, unit_label, kind, status, provider, model, created_at)
     VALUES(?,?,?,?,?,'generating',?,?,?)`,
  ).run(id, userId, lesson.title, lesson.unitLabel, lesson.kind, lesson.provider ?? null, lesson.model ?? null, Date.now())
  return id
}

export function finishLessonGeneration(
  lessonId: string,
  exercises: { kind: string; prompt: unknown; answer: unknown; itemId?: string }[],
): void {
  const insert = db.prepare(
    `INSERT INTO exercises(id, lesson_id, item_id, kind, prompt, answer, order_idx) VALUES(?,?,?,?,?,?,?)`,
  )
  const run = db.transaction(() => {
    exercises.forEach((ex, idx) => {
      insert.run(randomUUID(), lessonId, ex.itemId ?? null, ex.kind, JSON.stringify(ex.prompt), JSON.stringify(ex.answer), idx)
    })
    db.prepare(`UPDATE lessons SET status = 'ready' WHERE id = ?`).run(lessonId)
  })
  run()
}

export function failLesson(lessonId: string, error: string): void {
  db.prepare(`UPDATE lessons SET status = 'failed', error = ? WHERE id = ?`).run(error.slice(0, 500), lessonId)
}

export function getLesson(userId: string, lessonId: string) {
  const lesson = db
    .prepare<[string, string], LessonRow>('SELECT * FROM lessons WHERE user_id = ? AND id = ?')
    .get(userId, lessonId)
  if (!lesson) return undefined
  const exercises = db
    .prepare<[string], ExerciseRow>('SELECT * FROM exercises WHERE lesson_id = ? ORDER BY order_idx')
    .all(lessonId)
  return { lesson, exercises }
}

export function listLessons(userId: string, limit = 30): LessonRow[] {
  return db
    .prepare<[string, number], LessonRow>('SELECT * FROM lessons WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit)
}

export function completeLesson(
  userId: string,
  lessonId: string,
  payload: { xp: number; accuracy: number; durationMs: number },
  now = Date.now(),
) {
  db.prepare(
    `UPDATE lessons SET status='completed', xp=?, accuracy=?, duration_ms=?, completed_at=? WHERE user_id=? AND id=?`,
  ).run(payload.xp, payload.accuracy, payload.durationMs, now, userId, lessonId)

  const stats = getStats(userId, now)
  const day = today(now)
  let streak = stats.streak
  if (stats.last_lesson_day !== day) {
    streak = stats.last_lesson_day === yesterday(now) ? stats.streak + 1 : 1
  }
  db.prepare(
    `UPDATE user_stats SET xp = xp + ?, streak = ?, longest_streak = MAX(longest_streak, ?),
       last_lesson_day = ?, daily_seconds = daily_seconds + ?, daily_lessons = daily_lessons + ?,
       gems = gems + ? WHERE user_id = ?`,
  ).run(
    payload.xp,
    streak,
    streak,
    day,
    Math.round(payload.durationMs / 1000),
    1,
    Math.round(payload.xp / 3),
    userId,
  )
  return getStats(userId, now)
}

export function recordCombo(userId: string, combo: number): void {
  db.prepare('UPDATE user_stats SET best_combo = MAX(best_combo, ?) WHERE user_id = ?').run(combo, userId)
}

/* ------------------------------------------------------------------- tutor */

export function tutorHistory(userId: string, limit = 40) {
  return db
    .prepare<[string, number], { role: string; content: string; created_at: number }>(
      'SELECT role, content, created_at FROM tutor_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(userId, limit)
    .reverse()
}

export function saveTutorMessage(userId: string, role: 'user' | 'assistant', content: string): void {
  db.prepare('INSERT INTO tutor_messages(id, user_id, role, content, created_at) VALUES(?,?,?,?,?)').run(
    randomUUID(),
    userId,
    role,
    content,
    Date.now(),
  )
}

export function clearTutorHistory(userId: string): void {
  db.prepare('DELETE FROM tutor_messages WHERE user_id = ?').run(userId)
}

export function weakItems(userId: string, limit = 6) {
  return db
    .prepare<[string, number], ItemRow>(
      `SELECT * FROM items WHERE user_id = ? AND srs_state != 'new'
       ORDER BY (lapses * 2 + (1 - stability / 30.0)) DESC LIMIT ?`,
    )
    .all(userId, limit)
}

/* ------------------------------------------------------------------ images */

export function saveImage(
  userId: string,
  meta: { mime: string; bytes: number; provider: string; model: string; status: string; error?: string },
): string {
  const id = randomUUID()
  db.prepare(
    'INSERT INTO images(id, user_id, mime, bytes, provider, model, status, error, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(id, userId, meta.mime, meta.bytes, meta.provider, meta.model, meta.status, meta.error ?? null, Date.now())
  return id
}

export function listImages(userId: string, limit = 20) {
  return db
    .prepare<[string, number], { id: string; status: string; model: string | null; created_at: number }>(
      'SELECT id, status, model, created_at FROM images WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(userId, limit)
}

/* -------------------------------------------------------------- gamification */

/** Deterministic pseudo-leaderboard so the rank tab has stable, plausible data. */
export function leaderboard(userId: string) {
  const me = db.prepare<[string], StatsRow>('SELECT * FROM user_stats WHERE user_id = ?').get(userId)
  const bots: { name: string; char: string; color: string; xp: number }[] = [
    { name: 'Zoe', char: 'Z', color: '#F4A261', xp: 1480 },
    { name: 'Marco', char: 'M', color: '#7B8FE0', xp: 1310 },
    { name: '小林', char: '林', color: '#E4699B', xp: 1120 },
    { name: 'Amara', char: 'A', color: '#57C7B4', xp: 980 },
    { name: 'Diego', char: 'D', color: '#E8A33D', xp: 900 },
    { name: 'Priya', char: 'P', color: '#9B7BE0', xp: 860 },
    { name: 'Tomas', char: 'T', color: '#6FA8DC', xp: 700 },
    { name: 'Yuki', char: 'Y', color: '#5BC8F5', xp: 640 },
    { name: 'Nadia', char: 'N', color: '#3FC161', xp: 520 },
  ]
  const myXp = me?.xp ?? 0
  const rows = [
    ...bots,
    { name: '你', char: '你', color: '#3FC161', xp: myXp, me: true as const },
  ]
    .sort((a, b) => b.xp - a.xp)
    .map((row, idx) => ({ ...row, rank: idx + 1 }))
  const mine = rows.find((r) => 'me' in r && r.me)
  return { rows, myRank: mine?.rank ?? rows.length, league: '黄金联赛' }
}

export function quests(userId: string) {
  const s = getStats(userId)
  const goalMin = 15
  const lessonsGoal = 3
  return [
    {
      id: 'time',
      icon: 'clock',
      color: '#3FC161',
      title: `学习 ${goalMin} 分钟`,
      progress: Math.min(s.daily_seconds / 60, goalMin),
      goal: goalMin,
      unit: '分钟',
      reward: 15,
      done: s.daily_seconds / 60 >= goalMin,
    },
    {
      id: 'lessons',
      icon: 'check',
      color: '#1FB6F0',
      title: `完成 ${lessonsGoal} 节课`,
      progress: Math.min(s.daily_lessons, lessonsGoal),
      goal: lessonsGoal,
      unit: '节课',
      reward: 10,
      done: s.daily_lessons >= lessonsGoal,
    },
    {
      id: 'combo',
      icon: 'star',
      color: '#FFB420',
      title: '一次连续答对 10 题',
      progress: Math.min(s.best_combo, 10),
      goal: 10,
      unit: '题',
      reward: 20,
      done: s.best_combo >= 10,
    },
  ]
}
