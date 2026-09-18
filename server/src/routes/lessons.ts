import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../http/session.js'
import { getAiConfig } from '../ai/config.js'
import { generateLesson, makeTitleFromItems } from '../ai/lesson.js'
import { AiError } from '../ai/client.js'
import {
  completeLesson,
  createLesson,
  failLesson,
  finishLessonGeneration,
  getItems,
  getLesson,
  listLessons,
  recordCombo,
} from '../db/repo.js'
import type { Prompt, Answer } from '../types.js'
import { targetLangLabel } from '../http/lang.js'

export const lessonRoutes = new Hono<AppEnv>()

const genSchema = z.object({
  itemIds: z.array(z.string()).optional(),
  /** when true, pick the SRS due/weak items automatically */
  mode: z.enum(['auto', 'items']).optional(),
  theme: z.string().optional(),
  size: z.number().int().min(4).max(24).optional(),
  title: z.string().optional(),
})

/**
 * POST /api/lessons — ask the model to turn vocabulary into a Duolingo-style lesson.
 * Auto mode pulls whatever the forgetting curve says is due today.
 */
lessonRoutes.post('/lessons', async (c) => {
  const user = c.get('user')
  const cfg = getAiConfig()
  if (!cfg.mock && (!cfg.baseUrl || !cfg.apiKey)) {
    return c.json({ error: 'AI 未配置：请在后端设置 baseurl / apikey / model' }, 503)
  }

  const parsed = genSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法', issues: parsed.error.issues }, 400)
  const { itemIds, theme, size, title } = parsed.data

  let items = getItems(user.id, itemIds)
  if (!items.length) items = getItems(user.id)
  if (!items.length) {
    return c.json({ error: '词库为空，先去拍照或上传图片添加单词', code: 'EMPTY_DECK' }, 422)
  }
  items = items.slice(0, 20)

  const lessonId = createLesson(user.id, {
    title: title?.trim() || makeTitleFromItems(items),
    unitLabel: '第一单元',
    kind: 'custom',
    provider: cfg.mock ? 'mock' : new URL(cfg.baseUrl).host,
    model: cfg.model,
  })

  try {
    const generated = await generateLesson(items, {
      targetLangLabel: targetLangLabel(c, user.lang_label),
      theme,
      size,
      config: cfg,
    })

    const byText = new Map(items.map((i) => [i.norm, i]))
    finishLessonGeneration(
      lessonId,
      generated.exercises.map((ex) => ({
        kind: ex.kind,
        prompt: ex satisfies Prompt,
        answer: ex.answer satisfies Answer,
        itemId: byText.get(normalizeKey(ex.itemText))?.id,
      })),
    )

    const stored = getLesson(user.id, lessonId)!
    return c.json(serialize(stored, generated.intro))
  } catch (err) {
    const message = err instanceof AiError ? err.message : (err as Error).message
    failLesson(lessonId, message)
    return c.json({ error: message, lessonId }, 502)
  }
})

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim()
}

lessonRoutes.get('/lessons', (c) => {
  const user = c.get('user')
  return c.json({ lessons: listLessons(user.id) })
})

lessonRoutes.get('/lessons/:id', (c) => {
  const user = c.get('user')
  const found = getLesson(user.id, c.req.param('id'))
  if (!found) return c.json({ error: '课程不存在' }, 404)
  return c.json(serialize(found))
})

const completeSchema = z.object({
  xp: z.number().int().min(0).max(10_000),
  accuracy: z.number().min(0).max(1),
  durationMs: z.number().int().min(0).max(3_600_000),
  bestCombo: z.number().int().min(0).max(1000).optional(),
})

lessonRoutes.post('/lessons/:id/complete', async (c) => {
  const user = c.get('user')
  const parsed = completeSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)
  const found = getLesson(user.id, c.req.param('id'))
  if (!found) return c.json({ error: '课程不存在' }, 404)
  if (parsed.data.bestCombo) recordCombo(user.id, parsed.data.bestCombo)
  const stats = completeLesson(user.id, found.lesson.id, parsed.data)
  return c.json({ stats })
})

function serialize(
  found: { lesson: ReturnType<typeof listLessons>[number]; exercises: { id: string; kind: string; prompt: string; answer: string; item_id: string | null; order_idx: number }[] },
  intro?: string,
) {
  return {
    lesson: {
      id: found.lesson.id,
      title: found.lesson.title,
      unitLabel: found.lesson.unit_label,
      kind: found.lesson.kind,
      status: found.lesson.status,
      model: found.lesson.model,
      provider: found.lesson.provider,
      error: found.lesson.error,
      xp: found.lesson.xp,
      accuracy: found.lesson.accuracy,
      durationMs: found.lesson.duration_ms,
      createdAt: found.lesson.created_at,
    },
    intro,
    exercises: found.exercises.map((ex) => ({
      id: ex.id,
      itemId: ex.item_id,
      orderIndex: ex.order_idx,
      prompt: JSON.parse(ex.prompt) as Prompt,
      answer: JSON.parse(ex.answer) as Answer,
    })),
  }
}
