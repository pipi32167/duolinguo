import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal .env loader — no dependency, keeps secrets out of the bundle. */
function loadDotEnv(): void {
  const file = path.join(SERVER_ROOT, '.env')
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv()

const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v.trim())

export const env = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(SERVER_ROOT, 'data'),
  /** Falls back to the seed secret so local dev works out of the box. */
  adminToken: process.env.ADMIN_TOKEN ?? '',
  ai: {
    baseUrl: process.env.AI_BASE_URL ?? '',
    apiKey: process.env.AI_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'deepseek-flash',
    visionModel: process.env.AI_VISION_MODEL ?? '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90_000),
    mock: bool(process.env.AI_MOCK, false),
    temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
  },
} as const
