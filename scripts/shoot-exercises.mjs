#!/usr/bin/env node
/**
 * 题型 × 设备 巡检。
 *
 * 用 mock 数据生成一节「每种题型各 1 题」的课程，然后在 handoff 指定的
 * 视口矩阵上逐个题型：
 *   1. 采集布局指标（网格列数、点击目标尺寸、是否溢出、题干是否被截）
 *   2. 截图
 *   3. 填正确答案 → 检查 → 断言绿色反馈 → 继续
 *   全部答对，所以不会掉心，可以一路走完。
 *
 * 用法:
 *   node scripts/shoot-exercises.mjs                    # 全部 9 个视口
 *   node scripts/shoot-exercises.mjs --viewport 390x844
 *   node scripts/shoot-exercises.mjs --lesson <id>       # 复用已有课程
 *   node scripts/shoot-exercises.mjs --out artifacts/exercise-types
 *
 * 依赖: agent-browser，后端需要 AI_MOCK=1（否则会真调用模型）
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ args */

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const BASE = arg('base', 'http://localhost:5173')
const API = arg('api', 'http://localhost:8787')
const DEVICE = arg('device', 'exercise-preview-device1')
const OUT = path.resolve(root, arg('out', 'artifacts/exercise-types'))
const LESSON_ARG = arg('lesson', '')
const ONLY_VP = arg('viewport', '')
const ALLOW_REAL = argv.includes('--allow-real')

const VIEWPORTS = [
  { name: '360x800', w: 360, h: 800, label: '手机·小' },
  { name: '390x844', w: 390, h: 844, label: '手机·标准' },
  { name: '430x932', w: 430, h: 932, label: '手机·大' },
  { name: '600x960', w: 600, h: 960, label: '折叠屏' },
  { name: '820x1180', w: 820, h: 1180, label: '平板·竖' },
  { name: '1024x768', w: 1024, h: 768, label: '平板·横' },
  { name: '1366x768', w: 1366, h: 768, label: '笔记本' },
  { name: '1440x900', w: 1440, h: 900, label: '桌面' },
  { name: '1920x1080', w: 1920, h: 1080, label: '宽屏' },
].filter((v) => !ONLY_VP || v.name === ONLY_VP)

const KIND_LABEL = {
  translate_choice: '选择正确的翻译',
  wordbank: '组句（词块搬运）',
  listen_choice: '听音选词',
  match_pairs: '配对',
  fill_blank: '填空',
  translate_input: '自由输入',
}

/* --------------------------------------------------------------- helpers */

const C = {
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  bold: '\u001b[1m',
  off: '\u001b[0m',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** CJK 占两列，padEnd 会错位。 */
function width(text) {
  let w = 0
  for (const ch of String(text)) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  }
  return w
}
const pad = (text, target) => String(text) + ' '.repeat(Math.max(0, target - width(text)))

const apiHeaders = { 'x-device-id': DEVICE, 'content-type': 'application/json', 'x-target-lang': encodeURIComponent('英语') }

async function apiCall(pathname, init = {}) {
  const res = await fetch(API + pathname, { ...init, headers: { ...apiHeaders, ...(init.headers ?? {}) } })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
  return body
}

/** 通过 stdin 喂 JS，避免 shell 引号把表达式弄坏。 */
function browserEval(js) {
  return new Promise((resolve, reject) => {
    const child = spawn('agent-browser', ['eval', '--stdin'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && !out.trim()) return reject(new Error(err.trim() || `agent-browser exit ${code}`))
      resolve(out.trim())
    })
    child.stdin.end(js)
  })
}

function browser(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('agent-browser', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `exit ${code}`))))
  })
}

/** eval 返回的是 JSON 字符串的字符串，解开两层。 */
function unwrap(raw) {
  try {
    return JSON.parse(JSON.parse(raw))
  } catch {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
}

/* ------------------------------------------------------- page-side driver */

/** 页面侧驱动来自独立文件，避免模板字符串吃掉 \s / \u 这类转义。 */
const PAGE_DRIVER = fs.readFileSync(path.join(root, 'scripts', 'exercise-driver.js'), 'utf8')

/* ------------------------------------------------------------------- main */

console.log(`\n  ${C.bold}题型 × 设备 巡检${C.off}`)
console.log(`  ${C.dim}web ${BASE}   api ${API}   device ${DEVICE}${C.off}\n`)

// 0. 环境检查 —— 这个脚本会调 /api/extract 与 /api/lessons，
// 非 mock 模式下那是真实的模型调用（花钱）。默认直接拦住。
try {
  const health = await (await fetch(`${API}/api/health`)).json()
  if (!health.ai?.mock) {
    if (!ALLOW_REAL) {
      console.log(`  ${C.red}✗ 后端不是 MOCK 模式${C.off}`)
      console.log(`  ${C.dim}  这个巡检会生成课程，非 mock 时会真实调用模型并计费。${C.off}`)
      console.log(`  ${C.dim}  用 ${C.off}make mock${C.dim} 启动后端，或显式加 ${C.off}--allow-real${C.dim} 承担费用。${C.off}\n`)
      process.exit(1)
    }
    console.log(`  ${C.yellow}⚠ 非 MOCK 模式且已指定 --allow-real —— 本次会真实调用模型。${C.off}`)
  } else {
    console.log(`  ${C.dim}后端处于 MOCK 模式，不会调用真实模型${C.off}`)
  }
} catch {
  console.error(`  ${C.red}✗ 连不上后端 ${API} —— 先跑 make mock${C.off}\n`)
  process.exit(1)
}

// 1. 准备课程
let lessonId = LESSON_ARG
if (!lessonId) {
  const extracted = await apiCall('/api/extract', {
    method: 'POST',
    body: JSON.stringify({
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      mime: 'image/png',
    }),
  })
  const ids = extracted.items.slice(0, 6).map((i) => i.id)
  const lesson = await apiCall('/api/lessons', { method: 'POST', body: JSON.stringify({ itemIds: ids, title: '题型巡检' }) })
  lessonId = lesson.lesson.id
}

const detail = await apiCall(`/api/lessons/${lessonId}`)
const exercises = detail.exercises
console.log(`\n  课程 ${C.cyan}${detail.lesson.title}${C.off}  ${exercises.length} 题`)
exercises.forEach((e, i) => {
  console.log(`    ${String(i + 1).padStart(2)}. ${pad(KIND_LABEL[e.prompt.kind] ?? e.prompt.kind, 20)} ${C.dim}${e.answer.value.slice(0, 40)}${C.off}`)
})
console.log()

fs.mkdirSync(OUT, { recursive: true })

// 2. 逐视口巡检
const rows = []
let failures = 0

for (const vp of VIEWPORTS) {
  console.log(`  ${C.bold}${vp.name}${C.off} ${C.dim}(${vp.label})${C.off}`)

  await browser(['set', 'viewport', String(vp.w), String(vp.h)])
  // localStorage 在 about:blank 上是 SecurityError，必须先落到同源页面再写
  await browser(['open', `${BASE}/`])
  await browserEval(
    `localStorage.setItem('lingo.device', ${JSON.stringify(DEVICE)});` +
      `localStorage.setItem('lingo.profile', JSON.stringify({onboarded:true,lang:'en',langLabel:'英语',dailyGoalMin:10}));` +
      `'seeded'`,
  )
  await browser(['open', `${BASE}/lesson/${lessonId}`])
  await sleep(700)
  await browserEval(PAGE_DRIVER)

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    const kind = ex.prompt.kind

    const before = unwrap(await browserEval('JSON.stringify(window.__ex.snapshot())'))
    if (!before) {
      console.log(`    ${C.red}✗ 无法读取页面状态（第 ${i + 1} 题）${C.off}`)
      failures++
      break
    }

    const file = path.join(OUT, `${vp.name}__${String(i + 1).padStart(2, '0')}-${kind}.png`)
    await browser(['screenshot', file])

    // 先填答（不提交），截图停在「已作答、未判定」的状态
    const fillPayload = { kind, answer: ex.answer.value }
    await browserEval(`window.__ex.fill(${JSON.stringify(fillPayload)}).then((r) => JSON.stringify(r))`)
    if (kind === 'match_pairs') {
      await browser(['screenshot', path.join(OUT, `${vp.name}__${String(i + 1).padStart(2, '0')}-${kind}--matched.png`)])
    }

    const after = unwrap(await browserEval('window.__ex.submit().then((r) => JSON.stringify(r))'))

    const issues = []
    // 连对时 .q-kicker 会追加「连续答对 N 题」，用包含判断
    if (!before.kicker.startsWith(ex.prompt.kicker)) issues.push(`题干不符: 期望「${ex.prompt.kicker}」实际「${before.kicker}」`)
    if (before.overflow) issues.push(`溢出 scrollW=${before.scrollW}>${before.innerW}`)
    // 44px 是可点区域基线（iOS HIG / Material 一致）
    if (before.minTapH !== null && before.minTapH < 44) issues.push(`可点区域过矮 ${before.minTapH}px (<44)`)
    if (before.footVisible === false) issues.push('「检查」按钮不在视口内')
    if (kind === 'match_pairs' && before.matchLeft !== before.matchRight) issues.push(`配对两列数量不等 ${before.matchLeft}/${before.matchRight}`)
    // 数量相等不够：手机上两列会折成一列，看起来是 8 个连续选项
    if (kind === 'match_pairs' && !before.matchSide) issues.push('配对两列没有并排（折成了单列）')
    if (kind === 'translate_input' && (before.inputH ?? 0) < 80) issues.push(`输入框过矮 ${before.inputH}px`)
    if (!after || !after.submitted) {
      issues.push(`「检查」按钮在填答后仍禁用${after?.diag ? ` (${JSON.stringify(after.diag)})` : ''}`)
    } else if (after.resultClass !== 'result ok') {
      const shown = after.diag?.ansChips?.length ? ` 已填「${after.diag.ansChips.join(' ')}」` : ''
      issues.push(`未判定为正确: ${after.resultClass ?? '无反馈条'}${shown}`)
    }

    const ok = issues.length === 0
    if (!ok) failures++

    rows.push({
      viewport: vp.name,
      kind,
      label: KIND_LABEL[kind] ?? kind,
      optCols: before.optCols || null,
      matchLeft: before.matchLeft || null,
      bankCount: before.bankCount || null,
      optMinH: before.optMinH,
      chipMinH: before.chipMinH,
      inputH: before.inputH,
      minTapH: before.minTapH,
      bodyScrolls: before.bodyScrolls,
      ok,
      issues,
    })

    const detail = kind === 'match_pairs' ? `${before.matchCols}列 各${before.matchLeft}` : before.optCols ? `${before.optCols}列` : before.bankCount ? `${before.bankCount} 词块` : ''
    console.log(
      `    ${ok ? `${C.green}✓${C.off}` : `${C.red}✗${C.off}`} ${pad(KIND_LABEL[kind] ?? kind, 20)} ${C.dim}${pad(detail, 12)} 最小可点 ${before.minTapH ?? '—'}px${before.bodyScrolls ? ' ↕滚动' : ''}${C.off}`,
    )
    if (!ok) issues.forEach((m) => console.log(`        ${C.red}${m}${C.off}`))

    if (i < exercises.length - 1) {
      const nxt = unwrap(await browserEval('window.__ex.next().then((r) => JSON.stringify(r))'))
      if (!nxt?.advanced) {
        console.log(`        ${C.red}无法进入下一题${C.off}`)
        failures++
        break
      }
    } else {
      const nxt = unwrap(await browserEval('window.__ex.next().then((r) => JSON.stringify(r))'))
      if (!String(nxt?.url ?? '').includes('/complete')) {
        console.log(`        ${C.red}最后一题后未跳转到结算页: ${nxt?.url}${C.off}`)
        failures++
      } else {
        console.log(`        ${C.dim}→ 结算页 ${nxt.url}${C.off}`)
      }
      await browser(['screenshot', path.join(OUT, `${vp.name}__99-complete.png`)])
    }
  }
  console.log()
}

/* ----------------------------------------------------------------- report */

console.log(`  ${C.bold}汇总${C.off}\n`)
const header = ['视口', '题型', '布局', '最小可点', '结果']
console.log('    ' + header.map((h, i) => pad(h, [12, 20, 15, 10, 6][i])).join(''))
console.log('    ' + header.map((h, i) => '─'.repeat([12, 20, 15, 10, 6][i] - 2) + '  ').join(''))

for (const r of rows) {
  const layout = r.optCols
    ? `${r.optCols} 列选项`
    : r.matchLeft
      ? `${r.matchLeft}×2 配对`
      : r.bankCount
        ? `${r.bankCount} 词块`
        : r.inputH
          ? `输入框 ${r.inputH}px`
          : '—'
  console.log(
    '    ' +
      [
        pad(r.viewport, 12),
        pad(r.label, 20),
        pad(layout, 15),
        pad(r.minTapH ? `${r.minTapH}px` : '—', 10),
        r.ok ? `${C.green}通过${C.off}` : `${C.red}失败${C.off}`,
      ].join(''),
  )
}

console.log()
if (failures === 0) {
  console.log(`  ${C.green}✅ ${rows.length} 个「题型 × 视口」组合全部通过${C.off}`)
} else {
  console.log(`  ${C.red}❌ ${failures} 项失败${C.off}`)
}
console.log(`  ${C.dim}截图 ${fs.readdirSync(OUT).length} 张 → ${path.relative(root, OUT)}${C.off}\n`)

process.exit(failures === 0 ? 0 : 1)
