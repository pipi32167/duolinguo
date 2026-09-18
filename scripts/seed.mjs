#!/usr/bin/env node
/**
 * 演示数据种子。纯 SQL，不调用任何 AI（所以即使后端不是 mock 模式也能跑）。
 *
 *   node scripts/seed.mjs [device-id]     # 默认 docs-ui-seed
 *
 * 覆盖到: 词条(SRS 混合状态) / 到期 / 易忘 / 新词 / 30 天复习热力图 /
 * 已完成课程 / 导师对话 / 心耗尽一半 / 宝石与经验 / 连续天数 / 任务进度。
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const DEVICE = process.argv[2] ?? 'docs-ui-seed'
const dbPath = path.join(root, 'server', 'data', 'lingo.db')

/** better-sqlite3 is a native module and lives in the server workspace. */
const { default: Database } = await import(
  createRequire(path.join(root, 'server', 'package.json')).resolve('better-sqlite3')
)

const db = new Database(dbPath)
const now = Date.now()
const day = (n) => new Date(now - n * 86_400_000).toISOString().slice(0, 10)

// 幂等：先清掉这个设备已有的数据，重复执行不会撞唯一索引
const wipe = db.transaction(() => {
  for (const table of ['review_log', 'tutor_messages', 'exercises', 'lessons', 'items', 'images', 'user_stats']) {
    if (table === 'exercises') continue // 随 lessons 级联
    db.prepare(`DELETE FROM ${table} WHERE ${table === 'lessons' ? 'user_id' : 'user_id'} = ?`).run(DEVICE)
  }
})
wipe()

const ITEMS = [
  { text: 'apple', translation: '苹果', phonetic: '/ˈæp.əl/', pos: 'n.', topic: '食物', state: 'review', S: 4.2, D: 5.0, reps: 3, lapses: 1, dueDays: -9 },
  { text: 'orange', translation: '橙子', phonetic: '/ˈɒr.ɪndʒ/', pos: 'n.', topic: '食物', state: 'review', S: 2.5, D: 5.4, reps: 2, lapses: 2, dueDays: -3 },
  { text: 'grape', translation: '葡萄', phonetic: '/ɡreɪp/', pos: 'n.', topic: '食物', state: 'relearning', S: 0.8, D: 6.2, reps: 2, lapses: 3, dueDays: -0.01 },
  { text: 'banana', translation: '香蕉', phonetic: '/bəˈnɑː.nə/', pos: 'n.', topic: '食物', state: 'review', S: 12.1, D: 4.2, reps: 4, lapses: 0, dueDays: 12 },
  { text: 'coffee', translation: '咖啡', phonetic: '/ˈkɒf.i/', pos: 'n.', topic: '食物', state: 'learning', S: 1.4, D: 4.8, reps: 1, lapses: 0, dueDays: 0.01 },
  { text: 'a cup of coffee', translation: '一杯咖啡', pos: 'phr.', topic: '食物', state: 'review', S: 6.0, D: 5.0, reps: 5, lapses: 0, dueDays: -20 },
  { text: 'every morning', translation: '每天早上', pos: 'phr.', topic: '日常', state: 'new', S: 0, D: 0, reps: 0, lapses: 0, dueDays: 0 },
  { text: 'breakfast', translation: '早餐', phonetic: '/ˈbrek.fəst/', pos: 'n.', topic: '食物', state: 'new', S: 0, D: 0, reps: 0, lapses: 0, dueDays: 0 },
  { text: 'menu', translation: '菜单', phonetic: '/ˈmen.juː/', pos: 'n.', topic: '日常', state: 'new', S: 0, D: 0, reps: 0, lapses: 0, dueDays: 0 },
  { text: 'order', translation: '点餐；订单', phonetic: '/ˈɔː.dər/', pos: 'v.', topic: '日常', state: 'new', S: 0, D: 0, reps: 0, lapses: 0, dueDays: 0 },
  { text: 'how much is it', translation: '多少钱', pos: 'phr.', topic: '购物', state: 'review', S: 1.2, D: 5.8, reps: 1, lapses: 1, dueDays: -2 },
  { text: 'recommend', translation: '推荐', phonetic: '/ˌrek.əˈmend/', pos: 'v.', topic: '日常', state: 'review', S: 30.4, D: 3.4, reps: 6, lapses: 0, dueDays: 28 },
  { text: 'delicious', translation: '美味的', phonetic: '/dɪˈlɪʃ.əs/', pos: 'adj.', topic: '日常', state: 'learning', S: 2.2, D: 5.2, reps: 1, lapses: 0, dueDays: 2 },
]

const norm = (t) => t.toLowerCase().replace(/[\u2019\u2018]/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ').trim()
const guessType = (t) => {
  const words = t.trim().split(/\s+/).length
  return words <= 1 ? 'word' : words <= 4 ? 'phrase' : 'sentence'
}

const upsertUser = db.prepare(
  `INSERT INTO users(id, nickname, avatar_char, lang, lang_label, daily_goal_min, created_at, last_active_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, avatar_char = excluded.avatar_char, lang_label = excluded.lang_label, daily_goal_min = excluded.daily_goal_min,
     -- 必须一起回写 created_at。否则对已经存在的账号（比如 verify-responsive.sh
     -- 先用设备 id 打过 API 的场景）不会回填，页面上就会出现
     -- 「加入 1 天」和「连续 14 天」同屏的自我矛盾。
     created_at = excluded.created_at`,
)

// created_at 必须早于 longest_streak（下方 user_stats 里的 21 天），也要覆盖
// 30 天复习热力图：账号只有 14 天却记着 21 天最长连续，是同一类自相矛盾。
upsertUser.run(DEVICE, '学习者 4821', '学', 'en', '英语', 10, now - 30 * 86_400_000, now)
console.log(`→ device ${DEVICE}`)

const insertItem = db.prepare(
  `INSERT INTO items(id, user_id, image_id, text, norm, type, translation, phonetic, pos, example, example_zh, topic, note, created_at,
                     srs_state, stability, difficulty, due_at, last_review, reps, lapses, step)
   VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)

const txns = db.transaction(() => {
  for (const it of ITEMS) {
    const id = randomUUID()
    const dueAt = it.dueDays ? now + Math.round(it.dueDays * 86_400_000) : 0
    const lastReview = it.state === 'new' ? null : now - Math.abs(Math.min(it.dueDays, 0)) * 86_400_000
    insertItem.run(
      id,
      DEVICE,
      it.text,
      norm(it.text),
      guessType(it.text),
      it.translation,
      it.phonetic ?? null,
      it.pos ?? null,
      it.example ?? null,
      it.example_zh ?? null,
      it.topic ?? null,
      now - 14 * 86_400_000,
      it.state,
      it.S,
      it.D,
      dueAt,
      lastReview,
      it.reps,
      it.lapses,
      0,
    )
  }
})
txns()

/* ---- stats row ---- */
db.prepare(
  `INSERT INTO user_stats(user_id, hearts, hearts_refill_at, gems, xp, streak, longest_streak, last_lesson_day,
                             tutor_seconds, tutor_day, daily_seconds, daily_lessons, daily_day, best_combo)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(user_id) DO UPDATE SET
     hearts = excluded.hearts, hearts_refill_at = excluded.hearts_refill_at, gems = excluded.gems, xp = excluded.xp,
     streak = excluded.streak, longest_streak = excluded.longest_streak, last_lesson_day = excluded.last_lesson_day,
     tutor_seconds = excluded.tutor_seconds, tutor_day = excluded.tutor_day, daily_seconds = excluded.daily_seconds,
     daily_lessons = excluded.daily_lessons, daily_day = excluded.daily_day, best_combo = excluded.best_combo`,
).run(DEVICE, 3, now + 8 * 60 * 60 * 1000, 2140, 1080, 14, 21, day(0), 1047, day(0), 441, 1, day(0), 11)

/* ---- 30 天复习热力图 ---- */
const putReview = db.prepare(
  `INSERT INTO review_log(id, user_id, item_id, rating, correct, ms, prev_state, next_state, prev_s, next_s, prev_due, next_due, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)
const items = db.prepare('SELECT id, text FROM items WHERE user_id = ?').all(DEVICE)
let seededDays = 0
for (let d = 29; d >= 0; d--) {
  const n = d % 5
  for (let i = 0; i < n; i++) {
    const item = items[(d + i) % items.length]
    const grade = (d + i) % 4 === 0 ? 1 : ((d + i) % 4 === 1 ? 2 : 3)
    const correct = grade > 1 ? 1 : 0
    putReview.run(randomUUID(), DEVICE, item.id, grade, correct, 2000 + (d * i), 'review', grade === 1 ? 'relearning' : 'review', 2 + d / 8, 3.5 + d / 6, now - d * 86_400_000, now - d * 86_400_000 + 86_400_000, now - d * 86_400_000)
  }
  if (n) seededDays++
}

/* ---- 已完成课程 ---- */
const putLesson = db.prepare(
  `INSERT INTO lessons(id, user_id, title, unit_label, kind, status, provider, model, xp, accuracy, duration_ms, created_at, completed_at)
   VALUES (?, ?, ?, ?, 'custom', 'completed', 'mock', 'deepseek-flash', ?, ?, ?, ?, ?)`,
)
const lessons = [
  { title: '食物 · 6 个词', xp: 15, acc: 0.92, ms: 204_000, daysAgo: 2 },
  { title: '购物常用语', xp: 18, acc: 0.78, ms: 341_000, daysAgo: 1 },
  { title: '早餐菜单', xp: 12, acc: 0.95, ms: 98_000, daysAgo: 0 },
]
const picked = db.prepare('SELECT id FROM items WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').all(DEVICE)
for (const lesson of lessons) {
  const lessonId = randomUUID()
  putLesson.run(
    lessonId,
    DEVICE,
    lesson.title,
    '第一单元',
    lesson.xp,
    lesson.acc,
    lesson.ms,
    now - lesson.daysAgo * 86_400_000,
    now - lesson.daysAgo * 86_400_000 + lesson.ms,
  )
  picked.forEach(({ id }, idx) => {
    // exercises are not needed for the UI; skip to keep seeding cheap
    void id
    void idx
  })
}

/* ---- 导师消息 ---- */
const putMsg = db.prepare('INSERT INTO tutor_messages(id, user_id, role, content, created_at) VALUES (?,?,?,?,?)')
const tutor = [
  ['assistant', "Hi! Ready for today's speaking practice? 用英语聊聊今天吃过的早餐吧。"],
  ['user', 'I drink a cup of coffee every morning.'],
  ['assistant', 'Nice work. 注意 **every morning** 放在句尾更自然 👍'],
  ['user', 'And before class I eat breakfeast.'],
  ['assistant', '打错了一个词 **breakfast** —— 你已经有 1 个它在词库里，连对 3 题了，继续保持'],
  ['user', 'Oh right. Breakfast is served until ten.'],
]
for (const [role, content] of tutor) putMsg.run(randomUUID(), DEVICE, role, content, now - (tutor.length - 1) * 60_000 + Math.random() * 1000)

console.log(`   ✓ ${ITEMS.length} 词条(含到期 ${ITEMS.filter((i) => i.dueDays < 0).length} / 易忘 ${ITEMS.filter((i) => i.lapses > 0).length})`)
console.log(`   ✓ 30 天复习热力图 ${seededDays} 天`)
console.log(`   ✓ ${lessons.length} 节已完成课程 + ${tutor.length} 条导师消息`)
console.log(`   ✓ 心 3/5 · 宝石 2140 · xp 1080 · streak 14\n`)
console.log(`   浏览器里把 localStorage 的 lingo.device 设为 "${DEVICE}" 即可看到。`)
db.close()
