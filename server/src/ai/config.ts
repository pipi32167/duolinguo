import { env } from '../env.js'
import { setting, setSetting, deleteSetting, db } from '../db/index.js'

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
  visionModel: string
  timeoutMs: number
  temperature: number
  mock: boolean
}

const KEYS = {
  baseUrl: 'ai.base_url',
  apiKey: 'ai.api_key',
  model: 'ai.model',
  visionModel: 'ai.vision_model',
  timeoutMs: 'ai.timeout_ms',
  temperature: 'ai.temperature',
  mock: 'ai.mock',
} as const

/**
 * Effective config = runtime setting (editable from /admin) over env default.
 * Order matters: env provides the bootstrap values, the settings table wins.
 */
export function getAiConfig(): AiConfig {
  const visionFallback = env.ai.visionModel || env.ai.model
  return {
    baseUrl: (setting(KEYS.baseUrl) ?? env.ai.baseUrl).replace(/\/+$/, ''),
    apiKey: setting(KEYS.apiKey) ?? env.ai.apiKey,
    model: setting(KEYS.model) ?? env.ai.model,
    visionModel: setting(KEYS.visionModel) ?? visionFallback,
    timeoutMs: Number(setting(KEYS.timeoutMs) ?? env.ai.timeoutMs),
    temperature: Number(setting(KEYS.temperature) ?? env.ai.temperature),
    mock: (setting(KEYS.mock) ?? String(env.ai.mock)) === 'true',
  }
}

export interface AiConfigPatch {
  baseUrl?: string
  apiKey?: string
  model?: string
  visionModel?: string
  timeoutMs?: number
  temperature?: number
  mock?: boolean
}

export function updateAiConfig(patch: AiConfigPatch): AiConfig {
  const write = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '') deleteSetting(key)
    else setSetting(key, String(value))
  }
  if ('baseUrl' in patch) write(KEYS.baseUrl, patch.baseUrl?.trim())
  if ('apiKey' in patch) write(KEYS.apiKey, patch.apiKey?.trim())
  if ('model' in patch) write(KEYS.model, patch.model?.trim())
  if ('visionModel' in patch) write(KEYS.visionModel, patch.visionModel?.trim())
  if ('timeoutMs' in patch) write(KEYS.timeoutMs, patch.timeoutMs)
  if ('temperature' in patch) write(KEYS.temperature, patch.temperature)
  if ('mock' in patch) write(KEYS.mock, patch.mock)
  return getAiConfig()
}

/** Never ship the key to the browser. */
export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 10) return `${key.slice(0, 2)}***`
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
}

/** Safe, client-facing description of the active AI setup. */
export function publicAiConfig() {
  const c = getAiConfig()
  return {
    baseUrlHost: hostOf(c.baseUrl),
    baseUrl: c.baseUrl,
    model: c.model,
    visionModel: c.visionModel,
    apiKeyMasked: maskKey(c.apiKey),
    hasApiKey: Boolean(c.apiKey),
    configured: Boolean(c.baseUrl && c.apiKey),
    visionReady: Boolean(c.baseUrl && c.apiKey && c.visionModel && c.visionModel !== c.model),
    timeoutMs: c.timeoutMs,
    temperature: c.temperature,
    mock: c.mock,
    /** which values came from the DB rather than .env */
    overridden: overriddenKeys(),
  }
}

function overriddenKeys(): string[] {
  const rows = db
    .prepare<[], { key: string }>(`SELECT key FROM settings WHERE key LIKE 'ai.%'`)
    .all()
  return rows.map((r) => r.key.replace('ai.', ''))
}

export function resetAiConfig(): AiConfig {
  db.prepare(`DELETE FROM settings WHERE key LIKE 'ai.%'`).run()
  return getAiConfig()
}
