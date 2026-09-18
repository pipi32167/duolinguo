import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../http/session.js'
import { GRADE_LABEL, schedule, type Grade } from '../srs/fsrs.js'
import { applyReview, buildQueue, deckStats, dueCount, getItem, newCount } from '../db/repo.js'

export const reviewRoutes = new Hono<AppEnv>()

/** Today's review queue: overdue cards first, then weak cards, then new cards. */
reviewRoutes.get('/review/queue', (c) => {
  const user = c.get('user')
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 60)
  const entries = buildQueue(user.id, limit)
  return c.json({
    due: dueCount(user.id),
    fresh: newCount(user.id),
    stats: deckStats(user.id),
    grades: GRADE_LABEL,
    entries: entries.map((e) => ({
      reason: e.reason,
      retrievability: e.retrievability,
      overdueDays: e.overdueDays,
      preview: e.preview.map((p, idx) => ({
        grade: (idx + 1) as Grade,
        label: GRADE_LABEL[(idx + 1) as Grade],
        intervalDays: p.intervalDays,
        dueAt: p.due_at,
      })),
      item: e.item,
    })),
  })
})

const gradeSchema = z.object({
  itemId: z.string(),
  grade: z.number().int().min(1).max(4),
  ms: z.number().int().min(0).max(600_000).optional(),
})

reviewRoutes.post('/review/grade', async (c) => {
  const user = c.get('user')
  const parsed = gradeSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)
  const item = getItem(user.id, parsed.data.itemId)
  if (!item) return c.json({ error: '词条不存在' }, 404)
  const outcome = applyReview(user.id, item.id, parsed.data.grade as Grade, parsed.data.ms ?? 0)
  return c.json({
    item: outcome!.item,
    intervalDays: outcome!.intervalDays,
    nextDue: outcome!.nextDue,
    correct: outcome!.correct,
    preview: [1, 2, 3, 4].map((g) => {
      const next = schedule(outcome!.item, g as Grade)
      return { grade: g, label: GRADE_LABEL[g as Grade], intervalDays: next.intervalDays, dueAt: next.due_at }
    }),
    remaining: { due: dueCount(user.id), fresh: newCount(user.id) },
  })
})
