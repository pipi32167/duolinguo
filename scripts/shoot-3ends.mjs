#!/usr/bin/env node
/**
 * 三端 UI 快照巡检 —— 手机 / 平板 / 桌面各拍一遍关键页面。
 *
 *   node scripts/shoot-3ends.mjs                 # 全部
 *   node scripts/shoot-3ends.mjs --only mobile   # 只拍手机
 *   node scripts/shoot-3ends.mjs --device abc   # 换设备 id
 *
 * 纯读取，不调用模型：只访问已有页面，不会生成课程。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.WEB_URL ?? 'http://localhost:5173'
const DEVICE = arg('device', 'docs-ui-seed')
const ONLY = arg('only', '')
const OUT = path.join(root, 'artifacts', 'ui-3ends')

function arg(name, fallback) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  if (hit.includes('=')) return hit.split('=').slice(1).join('=')
  return process.argv[process.argv.indexOf(hit) + 1] ?? fallback
}

const C = {
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  bold: '\u001b[1m',
  off: '\u001b[0m',
}

const VIEWPORTS = [
  { name: 'mobile', w: 390, h: 844, label: '手机' },
  { name: 'tablet', w: 830, h: 1180, label: '平板' },
  { name: 'desktop', w: 1440, h: 900, label: '桌面' },
]

/** [文件名后缀, 路由, 页面内动作（可选）] */
const SHOTS = [
  ['learn', '/learn'],
  ['deck', '/deck'],
  ['review', '/review'],
  ['review-revealed', '/review', 'reveal'],
  ['me', '/me'],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

function browserEval(js) {
  return new Promise((resolve, reject) => {
    const child = spawn('agent-browser', ['eval', '--stdin'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && !out.trim()) return reject(new Error(err.trim() || `exit ${code}`))
      resolve(out.trim())
    })
    child.stdin.end(js)
  })
}

/* --------------------------------------------------------------- run */

try {
  const res = await fetch(`${BASE}/api/home`).catch(() => null)
  if (!res) throw new Error('unreachable')
} catch {
  console.error(`\n  ${C.red}✗ 连不上 ${BASE} —— 先跑 make dev 或 make mock${C.off}\n`)
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })
const targets = ONLY ? VIEWPORTS.filter((v) => v.name === ONLY) : VIEWPORTS
if (!targets.length) {
  console.error(`  ${C.red}未知视口 ${ONLY}${C.off}（可用：${VIEWPORTS.map((v) => v.name).join(' / ')}）\n`)
  process.exit(1)
}

console.log(`\n  ${C.bold}三端 UI 快照${C.off}  ${C.dim}${BASE}   device=${DEVICE}${C.off}`)
console.log(`  ${C.dim}输出 ${path.relative(root, OUT)}/${C.off}\n`)

let failures = 0

for (const vp of targets) {
  console.log(`  ${C.bold}${vp.name}${C.off} ${C.dim}(${vp.label} ${vp.w}×${vp.h})${C.off}`)

  await browser(['set', 'viewport', String(vp.w), String(vp.h)])
  // localStorage 在 about:blank 上是 SecurityError，必须先落到同源页面再写
  await browser(['open', `${BASE}/`])
  await browserEval(
    `localStorage.setItem('lingo.device', ${JSON.stringify(DEVICE)});` +
      `localStorage.setItem('lingo.profile', JSON.stringify({onboarded:true,lang:'en',langLabel:'英语',dailyGoalMin:10}));` +
      `'seeded'`,
  )

  for (const [name, route, action] of SHOTS) {
    await browser(['open', `${BASE}${route}`])
    await sleep(1300)

    if (action === 'reveal') {
      const hit = await browserEval(
        `(() => {
           const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '显示答案');
           if (!b) return 'none';
           b.click();
           return 'clicked';
         })()`,
      )
      if (!String(hit).includes('clicked')) {
        console.log(`    ${C.red}✗ ${name}：找不到「显示答案」按钮（${hit}）${C.off}`)
        failures++
        continue
      }
      await sleep(900)
    }

    const file = path.join(OUT, `${vp.name}-${name}.png`)
    await browser(['screenshot', file])
    const kb = Math.round(fs.statSync(file).size / 1024)
    console.log(`    ${C.green}✓${C.off} ${name.padEnd(16)} ${C.dim}${kb} KB${C.off}`)
  }
  console.log()
}

console.log(failures ? `  ${C.red}${failures} 张失败${C.off}\n` : `  ${C.green}全部完成${C.off}  ${C.dim}${targets.length * SHOTS.length} 张${C.off}\n`)
process.exit(failures ? 1 : 0)
