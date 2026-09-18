#!/usr/bin/env node
/**
 * AI 配置命令行工具。
 *
 *   node scripts/ai.mjs status     # 查看后端生效的配置（不含 Key 明文）
 *   node scripts/ai.mjs test       # 真实调用文本模型 + 视觉模型做连通性自检
 *   node scripts/ai.mjs models     # 打印每个模型会命中的接口地址
 *
 * ADMIN_TOKEN 会自动从 server/.env 读取，无需手动传。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.API_PORT ?? '8787'
const base = process.env.API_BASE ?? `http://localhost:${port}`

function adminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN
  const file = path.join(root, 'server', '.env')
  if (!fs.existsSync(file)) return ''
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*ADMIN_TOKEN\s*=\s*(.*)$/.exec(line)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

async function call(pathname, init) {
  const token = adminToken()
  const headers = { 'content-type': 'application/json', 'x-device-id': 'cli-device-0001' }
  if (token) headers['x-admin-token'] = token
  let res
  try {
    res = await fetch(base + pathname, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
  } catch {
    console.error(`❌ 无法连接后端 ${base} —— 先跑 \`make dev\` 或 \`make mock\`。`)
    process.exit(1)
  }
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

const GREEN = '\u001b[32m'
const RED = '\u001b[31m'
const YELLOW = '\u001b[33m'
const DIM = '\u001b[2m'
const OFF = '\u001b[0m'

const row = (label, value) => console.log(`  ${pad(label)}${value}`)
const mark = (ok) => (ok ? `${GREEN}✓${OFF}` : `${RED}✗${OFF}`)

/** CJK glyphs occupy two terminal columns, so String.padEnd misaligns these labels. */
function width(text) {
  let w = 0
  for (const ch of text) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  }
  return w
}

const pad = (text, target = 18) => text + ' '.repeat(Math.max(0, target - width(text)))

const command = process.argv[2] ?? 'status'

if (command === 'status') {
  const { status, body } = await call('/api/ai/status')
  if (status !== 200) {
    console.error(`${RED}读取失败 (${status})${OFF}`, body)
    process.exit(1)
  }
  const mode = body.mock
    ? `${YELLOW}MOCK 模式（不调用真实模型）${OFF}`
    : body.configured
      ? `${GREEN}已配置${OFF}`
      : `${RED}未配置${OFF}`
  console.log('\n  AI 配置\n')
  row('状态', mode)
  row('baseurl', body.baseUrl || `${RED}（空）${OFF}`)
  row('文本模型', body.model || `${RED}（空）${OFF}`)
  row(
    '视觉模型',
    body.visionModel
      ? `${body.visionModel}${body.visionReady ? '' : `  ${YELLOW}与文本模型相同 —— 传图可能报 400${OFF}`}`
      : `${RED}（空）${OFF}`,
  )
  row('API Key', body.hasApiKey ? body.apiKeyMasked : `${RED}（空）${OFF}`)
  row('temperature', String(body.temperature))
  row('timeout', `${body.timeoutMs}ms`)
  row(
    '覆盖来源',
    body.overridden?.length ? `settings 表: ${body.overridden.join(', ')}` : `${DIM}全部来自 server/.env${OFF}`,
  )
  console.log(`\n  ${DIM}浏览器永远拿不到 Key；修改请用 http://localhost:5173/admin${OFF}\n`)
  process.exit(body.configured || body.mock ? 0 : 1)
}

if (command === 'test') {
  console.log('\n  连通性自检（真实请求）\n')
  const { status, body } = await call('/api/ai/test', { method: 'POST' })
  if (status !== 200) {
    console.error(`  ${RED}失败${OFF} (${status}) ${body.error ?? JSON.stringify(body)}\n`)
    process.exit(1)
  }
  if (body.note) console.log(`  ${YELLOW}${body.note}${OFF}\n`)
  if (body.endpoint) row('接口', body.endpoint)
  if (body.baseUrlHost) row('主机', body.baseUrlHost)
  console.log()
  row('文本模型', `${mark(body.text?.ok)} ${body.text?.model ?? '-'}  ${body.text?.ok ? `${body.text.ms}ms` : `${RED}${body.text?.error}${OFF}`}`)
  row('视觉模型', `${mark(body.vision?.ok)} ${body.vision?.model ?? '-'}  ${body.vision?.ok ? `${body.vision.ms}ms` : `${RED}${body.vision?.error}${OFF}`}`)
  console.log()
  if (!body.ok) {
    console.log(`  ${DIM}提示：\`deepseek-flash\` 等纯文本模型不接受图片输入，`)
    console.log(`  需要在 /admin 或 server/.env 单独指定 AI_VISION_MODEL。${OFF}\n`)
  }
  process.exit(body.ok ? 0 : 1)
}

if (command === 'models') {
  const { body } = await call('/api/ai/admin/endpoint')
  const { body: cfg } = await call('/api/ai/status')
  console.log('\n  模型 → 接口\n')
  row('文本模型', `${cfg.model}`)
  row('  →', body.endpoint || `${RED}（baseurl 未配置）${OFF}`)
  console.log()
  row('视觉模型', `${cfg.visionModel}`)
  row('  →', body.endpoint || `${RED}（baseurl 未配置）${OFF}`)
  console.log()
  process.exit(0)
}

console.error(`未知命令: ${command}`)
console.error('可用: status | test | models')
process.exit(2)
