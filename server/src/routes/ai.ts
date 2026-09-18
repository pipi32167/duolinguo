import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../http/session.js'
import { requireAdmin } from '../http/session.js'
import { getAiConfig, publicAiConfig, resetAiConfig, updateAiConfig } from '../ai/config.js'
import { AiError, chatEndpoint, checkConnection } from '../ai/client.js'
import { mockStatus } from '../ai/mock.js'
import { extractFromImage } from '../ai/extract.js'

export const aiRoutes = new Hono<AppEnv>()

/** Client-safe view of the active AI setup (never includes the key). */
aiRoutes.get('/ai/status', (c) => c.json(publicAiConfig()))

/** Full config, for the admin page. */
aiRoutes.get('/ai/admin/config', requireAdmin(), (c) => c.json(publicAiConfig()))

const patchSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  visionModel: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(600_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  mock: z.boolean().optional(),
})

aiRoutes.put('/ai/admin/config', requireAdmin(), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: '参数不合法', issues: parsed.error.issues }, 400)
  const patch = { ...parsed.data }
  // An empty string means "clear the override and fall back to .env".
  if (patch.apiKey === '••••••••') delete patch.apiKey
  updateAiConfig(patch)
  return c.json(publicAiConfig())
})

aiRoutes.delete('/ai/admin/config', requireAdmin(), (c) => {
  resetAiConfig()
  return c.json(publicAiConfig())
})

aiRoutes.get('/ai/admin/endpoint', requireAdmin(), (c) => {
  const cfg = getAiConfig()
  try {
    return c.json({ endpoint: chatEndpoint(cfg.baseUrl) })
  } catch {
    return c.json({ endpoint: '' })
  }
})

/** Live connectivity check against the text model and, optionally, the vision model. */
aiRoutes.post('/ai/test', requireAdmin(), async (c) => {
  const cfg = getAiConfig()
  if (cfg.mock) return c.json(mockStatus(cfg))
  if (!cfg.baseUrl || !cfg.apiKey) {
    return c.json({ ok: false, error: '请先配置 baseurl 与 apiKey' }, 400)
  }

  const text = await checkConnection(cfg.model)
  const useVision = cfg.visionModel && cfg.visionModel !== cfg.model
  let vision: { ok: boolean; error?: string; ms: number } | null = null
  if (useVision) {
    // A 1x1 PNG is enough to prove the model accepts image payloads.
    const tiny =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
    const started = Date.now()
    try {
      await extractFromImage(tiny, 'image/png', {
        targetLangLabel: '英语',
        focus: '这是一张 1x1 测试图，若看不清内容请返回一个占位条目',
        config: cfg,
      })
      vision = { ok: true, ms: Date.now() - started }
    } catch (err) {
      vision = { ok: false, error: (err as Error).message, ms: Date.now() - started }
    }
  }

  return c.json({
    ok: text.ok && (vision?.ok ?? true),
    mock: false,
    baseUrlHost: new URL(cfg.baseUrl).host,
    endpoint: chatEndpoint(cfg.baseUrl),
    text: { ...text, model: cfg.model },
    vision: vision ? { ...vision, model: cfg.visionModel } : { ok: false, error: '未配置独立视觉模型' },
  })
})

aiRoutes.onError((err, c) => {
  if (err instanceof AiError) return c.json({ error: err.message }, (err.status ?? 500) as 400)
  console.error(err)
  return c.json({ error: '服务器内部错误' }, 500)
})
