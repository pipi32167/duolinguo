import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../http/session.js'
import { GRADE_LABEL, type Grade } from '../srs/fsrs.js'
import {
  applyReview,
  deckStats,
  deleteItems,
  getItem,
  getItems,
  itemCurve,
  listImages,
  resetItemSrs,
  reviewHeatmap,
  updateItem,
} from '../db/repo.js'

export const deckRoutes = new Hono<AppEnv>()

deckRoutes.get('/items', (c) => {
  const user = c.get('user')
  const q = c.req.query('q')?.trim().toLowerCase()
  const kind = c.req.query('type')
  let items = getItems(user.id)
  if (kind && kind !== 'all') items = items.filter((i) => i.type === kind)
  if (q) {
    items = items.filter(
      (i) =>
        i.text.toLowerCase().includes(q) ||
        i.translation.includes(q) ||
        (i.topic ?? '').includes(q),
    )
  }
  return c.json({ items })
})

deckRoutes.get('/items/:id', (c) => {
  const user = c.get('user')
  const item = getItem(user.id, c.req.param('id'))
  if (!item) return c.json({ error: '词条不存在' }, 404)
  return c.json({ item, curve: itemCurve(item), grades: GRADE_LABEL })
})

const patchSchema = z.object({
  text: z.string().min(1).optional(),
  translation: z.string().optional(),
  phonetic: z.string().nullable().optional(),
  pos: z.string().nullable().optional(),
  example: z.string().nullable().optional(),
  example_zh: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  type: z.enum(['word', 'phrase', 'sentence']).optional(),
})

deckRoutes.patch('/items/:id', async (c) => {
  const user = c.get('user')
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法', issues: parsed.error.issues }, 400)
  const item = updateItem(user.id, c.req.param('id'), parsed.data)
  if (!item) return c.json({ error: '词条不存在' }, 404)
  return c.json({ item })
})

const deleteSchema = z.object({ ids: z.array(z.string()).min(1) })

deckRoutes.post('/items/delete', async (c) => {
  const user = c.get('user')
  const parsed = deleteSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)
  return c.json({ deleted: deleteItems(user.id, parsed.data.ids) })
})

const reviewSchema = z.object({
  grade: z.number().int().min(1).max(4),
  ms: z.number().int().min(0).max(600_000).optional(),
  /** when true the schedule is only previewed, not persisted */
  dryRun: z.boolean().optional(),
})

deckRoutes.post('/items/:id/review', async (c) => {
  const user = c.get('user')
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)
  const item = getItem(user.id, c.req.param('id'))
  if (!item) return c.json({ error: '词条不存在' }, 404)

  const outcome = applyReview(user.id, item.id, parsed.data.grade as Grade, parsed.data.ms ?? 0)
  return c.json({
    item: outcome?.item,
    intervalDays: outcome?.intervalDays,
    nextDue: outcome?.nextDue,
    correct: outcome?.correct,
    curve: itemCurve(outcome!.item),
  })
})

deckRoutes.post('/items/:id/reset', (c) => {
  const user = c.get('user')
  resetItemSrs(user.id, c.req.param('id'))
  const item = getItem(user.id, c.req.param('id'))!
  return c.json({ item, curve: itemCurve(item) })
})

deckRoutes.get('/deck/stats', (c) => {
  const user = c.get('user')
  return c.json({ stats: deckStats(user.id), heatmap: reviewHeatmap(user.id), images: listImages(user.id) })
})
