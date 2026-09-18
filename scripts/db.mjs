#!/usr/bin/env node
/**
 * SQLite 小工具 —— 免得为了看几行数据去装 sqlite3 CLI。
 *
 *   node scripts/db.mjs stats            # 用户 / 词条 / 课程 / 复习记录计数
 *   node scripts/db.mjs items            # 词库明细（含遗忘曲线状态）
 *   node scripts/db.mjs lessons          # 最近课程
 *   node scripts/db.mjs due              # 今日到期卡片
 *   node scripts/db.mjs sql "SELECT ..." # 只读查询
 *   node scripts/db.mjs reset            # 删除数据库文件
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.env.DB_FILE ?? path.join(root, 'server', 'data', 'lingo.db')
const command = process.argv[2] ?? 'stats'

if (command === 'reset') {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix
    if (fs.existsSync(file)) {
      fs.rmSync(file)
      console.log(`已删除 ${path.relative(root, file)}`)
    }
  }
  process.exit(0)
}

if (!fs.existsSync(dbPath)) {
  console.error(`找不到数据库：${path.relative(root, dbPath)}`)
  console.error('先跑一次 `make dev`，或直接 `make mock`。')
  process.exit(1)
}

const { default: Database } = await import(
  // better-sqlite3 is a native module, so npm keeps it in the server workspace
  // rather than hoisting it to the root — resolve it from there.
  createRequire(path.join(root, 'server', 'package.json')).resolve('better-sqlite3')
)
const db = new Database(dbPath, { readonly: command !== 'sql' })

/** CJK glyphs occupy two columns, so String.padEnd alone misaligns the table. */
function width(text) {
  let w = 0
  for (const ch of text) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  }
  return w
}

const pad = (text, target) => text + ' '.repeat(Math.max(0, target - width(text)))

const table = (rows) => {
  if (!rows.length) return '（无数据）'
  const cols = Object.keys(rows[0])
  const widths = cols.map((c) =>
    Math.max(width(c), ...rows.map((r) => width(String(r[c] ?? '')))),
  )
  const line = (cells, fill) =>
    cells.map((c, i) => (fill === '─' ? '─'.repeat(widths[i]) : pad(String(c ?? ''), widths[i]))).join('  ')
  return [
    line(cols),
    line(
      widths.map(() => ''),
      '─',
    ),
    ...rows.map((r) => line(cols.map((c) => r[c]))),
  ].join('\n')
}

const now = Date.now()

switch (command) {
  case 'stats': {
    const q = (sql, ...args) => db.prepare(sql).get(...args)?.c ?? 0
    console.log(`数据库  ${path.relative(root, dbPath)}  (${(fs.statSync(dbPath).size / 1024).toFixed(0)} KB)\n`)
    console.log(
      table([
        { 表: '用户', 行数: q('SELECT COUNT(*) c FROM users') },
        { 表: '词条', 行数: q('SELECT COUNT(*) c FROM items') },
        { 表: '图片', 行数: q('SELECT COUNT(*) c FROM images') },
        { 表: '课程', 行数: q('SELECT COUNT(*) c FROM lessons') },
        { 表: '练习题', 行数: q('SELECT COUNT(*) c FROM exercises') },
        { 表: '复习记录', 行数: q('SELECT COUNT(*) c FROM review_log') },
        { 表: '导师消息', 行数: q('SELECT COUNT(*) c FROM tutor_messages') },
        { 表: '运行时设置', 行数: q("SELECT COUNT(*) c FROM settings WHERE key LIKE 'ai.%'") },
      ]),
    )
    console.log('\n记忆状态分布')
    console.log(
      table(
        db
          .prepare('SELECT srs_state AS 状态, COUNT(*) AS 数量, ROUND(AVG(stability),2) AS 平均稳定度 FROM items GROUP BY srs_state')
          .all(),
      ),
    )
    console.log(`\n今日到期  ${q("SELECT COUNT(*) c FROM items WHERE srs_state != 'new' AND due_at <= ?", now)}`)
    break
  }

  case 'items':
    console.log(
      table(
        db
          .prepare(
            `SELECT text AS 词条, translation AS 释义, type AS 类型,
                    srs_state AS 状态, ROUND(stability,2) AS S, ROUND(difficulty,2) AS D,
                    reps AS 复习, lapses AS 答错,
                    CASE WHEN due_at = 0 THEN '待学' ELSE datetime(due_at/1000,'unixepoch','localtime') END AS 下次到期
             FROM items ORDER BY created_at DESC LIMIT 40`,
          )
          .all(),
      ),
    )
    break

  case 'lessons':
    console.log(
      table(
        db
          .prepare(
            `SELECT title AS 课程, status AS 状态, model AS 模型, xp AS 经验,
                    ROUND(COALESCE(accuracy,0)*100) AS 准确率,
                    (SELECT COUNT(*) FROM exercises e WHERE e.lesson_id = l.id) AS 题数,
                    datetime(created_at/1000,'unixepoch','localtime') AS 创建时间
             FROM lessons l ORDER BY created_at DESC LIMIT 20`,
          )
          .all(),
      ),
    )
    break

  case 'due':
    console.log(
      table(
        db
          .prepare(
            `SELECT text AS 词条, translation AS 释义, srs_state AS 状态,
                    ROUND(stability,2) AS S, lapses AS 答错,
                    ROUND((? - due_at)/86400000.0, 1) AS 逾期天数
             FROM items WHERE srs_state != 'new' AND due_at <= ?
             ORDER BY due_at ASC LIMIT 40`,
          )
          .all(now, now),
      ),
    )
    break

  case 'sql': {
    const query = process.argv.slice(3).join(' ')
    if (!query) {
      console.error('用法: node scripts/db.mjs sql "SELECT * FROM items LIMIT 5"')
      process.exit(2)
    }
    if (!/^\s*(select|with|pragma|explain)/i.test(query)) {
      console.error('只允许只读查询（SELECT / WITH / PRAGMA / EXPLAIN）。')
      process.exit(2)
    }
    console.log(table(db.prepare(query).all()))
    break
  }

  default:
    console.error(`未知命令: ${command}`)
    console.error('可用: stats | items | lessons | due | sql | reset')
    process.exit(2)
}

db.close()
