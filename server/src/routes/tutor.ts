import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { AppEnv } from '../http/session.js'
import { getAiConfig } from '../ai/config.js'
import { streamTutorReply } from '../ai/tutor.js'
import {
  TUTOR_FREE_SECONDS,
  addTutorSeconds,
  clearTutorHistory,
  getStats,
  saveTutorMessage,
  tutorHistory,
  weakItems,
} from '../db/repo.js'

export const tutorRoutes = new Hono<AppEnv>()

export const TUTOR_NAME = 'Lina'

tutorRoutes.get('/tutor', (c) => {
  const user = c.get('user')
  const stats = getStats(user.id)
  const cfg = getAiConfig()
  return c.json({
    tutor: { name: TUTOR_NAME, role: '口语导师', avatar: 'L' },
    quota: {
      usedSeconds: stats.tutor_seconds,
      totalSeconds: TUTOR_FREE_SECONDS,
      remainingSeconds: Math.max(0, TUTOR_FREE_SECONDS - stats.tutor_seconds),
      resetsInSeconds: secondsUntilMidnight(),
    },
    hasKey: Boolean(cfg.apiKey) || cfg.mock,
    model: cfg.model,
    mock: cfg.mock,
    messages: tutorHistory(user.id),
  })
})

tutorRoutes.delete('/tutor', (c) => {
  clearTutorHistory(c.get('user').id)
  return c.json({ ok: true })
})

const sendSchema = z.object({
  content: z.string().min(1).max(2000),
  secondsSpent: z.number().min(0).max(600).optional(),
})

/** SSE stream so the tutor types out its reply in real time. */
tutorRoutes.post('/tutor', async (c) => {
  const user = c.get('user')
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)

  const stats = getStats(user.id)
  const remaining = TUTOR_FREE_SECONDS - stats.tutor_seconds
  if (remaining <= 0) {
    return c.json({ error: '今日免费对话时长已用完', code: 'QUOTA_EXHAUSTED', resetsInSeconds: secondsUntilMidnight() }, 402)
  }

  const cfg = getAiConfig()
  if (!cfg.mock && (!cfg.baseUrl || !cfg.apiKey)) {
    return c.json({ error: 'AI 未配置：请在后端设置 baseurl / apikey / model' }, 503)
  }

  saveTutorMessage(user.id, 'user', parsed.data.content)
  if (parsed.data.secondsSpent) addTutorSeconds(user.id, parsed.data.secondsSpent)

  const history = tutorHistory(user.id, 20).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  const weak = weakItems(user.id, 5).map((i) => ({ text: i.text, translation: i.translation }))

  return streamSSE(c, async (stream) => {
    let full = ''
    try {
      for await (const delta of streamTutorReply(history, {
        targetLangLabel: user.lang_label,
        level: stats.streak > 10 ? '中级' : '初中级',
        weakItems: weak,
      })) {
        full += delta
        await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: delta }) })
      }
      saveTutorMessage(user.id, 'assistant', full)
      const after = getStats(user.id)
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({
          content: full,
          remainingSeconds: Math.max(0, TUTOR_FREE_SECONDS - after.tutor_seconds),
        }),
      })
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: (err as Error).message }),
      })
    }
  })
})

function secondsUntilMidnight(): number {
  const now = new Date()
  const end = new Date(now)
  end.setHours(24, 0, 0, 0)
  return Math.round((end.getTime() - now.getTime()) / 1000)
}
