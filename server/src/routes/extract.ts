import { Hono } from 'hono'
import type { AppEnv } from '../http/session.js'
import { getAiConfig } from '../ai/config.js'
import { extractFromImage, normalizeExtracted } from '../ai/extract.js'
import { AiError } from '../ai/client.js'
import { getItems, saveImage, upsertItems } from '../db/repo.js'
import { targetLangLabel } from '../http/lang.js'

export const extractRoutes = new Hono<AppEnv>()

const MAX_BYTES = 12 * 1024 * 1024

/**
 * POST /api/extract — multipart upload (field `image`), or JSON
 * `{ image: dataUrl, mime }`. Returns the recognized vocabulary and persists it.
 */
extractRoutes.post('/extract', async (c) => {
  const user = c.get('user')
  const cfg = getAiConfig()

  if (!cfg.mock && (!cfg.baseUrl || !cfg.apiKey)) {
    return c.json({ error: 'AI 未配置：请在后端设置 baseurl / apikey / model' }, 503)
  }

  let dataUrl = ''
  let mime = 'image/jpeg'
  let bytes = 0
  let focus = ''

  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody({ all: false })
    const file = body['image']
    focus = typeof body['focus'] === 'string' ? body['focus'] : ''
    if (!(file instanceof File)) return c.json({ error: '缺少 image 文件字段' }, 400)
    if (file.size > MAX_BYTES) return c.json({ error: '图片过大（上限 12MB）' }, 413)
    const buf = Buffer.from(await file.arrayBuffer())
    bytes = buf.byteLength
    mime = file.type || 'image/jpeg'
    dataUrl = `data:${mime};base64,${buf.toString('base64')}`
  } else {
    const body = (await c.req.json().catch(() => ({}))) as { image?: string; mime?: string; focus?: string }
    if (!body.image?.startsWith('data:')) return c.json({ error: '缺少 image dataUrl' }, 400)
    dataUrl = body.image
    mime = body.mime ?? dataUrl.slice(5, dataUrl.indexOf(';')) ?? 'image/jpeg'
    focus = body.focus ?? ''
    bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
    if (bytes > MAX_BYTES) return c.json({ error: '图片过大（上限 12MB）' }, 413)
  }

  const imageId = saveImage(user.id, {
    mime,
    bytes,
    provider: cfg.baseUrl ? new URL(cfg.baseUrl).host : 'mock',
    model: cfg.visionModel,
    status: 'processing',
  })

  try {
    const result = await extractFromImage(dataUrl, mime, {
      targetLangLabel: targetLangLabel(c),
      focus,
      config: cfg,
    })
    const normalized = normalizeExtracted(result)
    if (normalized.length === 0) {
      return c.json(
        { error: '没有在图片里识别到可学习的词条，试试更清晰、光线更好的照片', imageId },
        422,
      )
    }
    const { inserted, updated, ids } = upsertItems(user.id, imageId, normalized)
    return c.json({
      imageId,
      detectedLanguage: result.detected_language,
      imageKind: result.image_kind,
      notes: result.notes,
      provider: cfg.mock ? 'mock' : new URL(cfg.baseUrl).host,
      model: cfg.visionModel,
      inserted,
      updated,
      items: getItems(user.id, ids),
    })
  } catch (err) {
    const message = err instanceof AiError ? err.message : (err as Error).message
    return c.json({ error: message, imageId }, 502)
  }
})
