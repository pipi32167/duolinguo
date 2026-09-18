import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../http/session.js'
import { getAiConfig } from '../ai/config.js'
import { currentRetrievability } from '../srs/fsrs.js'
import {
  HEARTS_MAX,
  HEART_REFILL_MS,
  TUTOR_FREE_SECONDS,
  addGems,
  deckStats,
  dueCount,
  getItems,
  getStats,
  leaderboard,
  listLessons,
  newCount,
  quests,
  refillHearts,
  spendHeart,
  updateUser,
} from '../db/repo.js'

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/me', (c) => {
  const user = c.get('user')
  const stats = getStats(user.id)
  const deck = deckStats(user.id)
  const cfg = getAiConfig()
  return c.json({
    user,
    stats: {
      ...stats,
      heartsMax: HEARTS_MAX,
      heartRefillSeconds: stats.hearts_refill_at
        ? Math.max(0, Math.round((stats.hearts_refill_at - Date.now()) / 1000))
        : 0,
      heartRefillTotalSeconds: HEART_REFILL_MS / 1000,
      tutorRemainingSeconds: Math.max(0, TUTOR_FREE_SECONDS - stats.tutor_seconds),
      tutorTotalSeconds: TUTOR_FREE_SECONDS,
    },
    deck: { ...deck, due: dueCount(user.id), fresh: newCount(user.id) },
    lessons: listLessons(user.id, 10),
    ai: {
      configured: Boolean(cfg.apiKey) && Boolean(cfg.baseUrl),
      mock: cfg.mock,
      model: cfg.model,
      visionModel: cfg.visionModel,
    },
  })
})

const patchSchema = z.object({
  nickname: z.string().min(1).max(24).optional(),
  avatar_char: z.string().min(1).max(2).optional(),
  lang: z.string().min(2).max(8).optional(),
  lang_label: z.string().min(1).max(16).optional(),
  daily_goal_min: z.number().int().min(5).max(60).optional(),
})

meRoutes.patch('/me', async (c) => {
  const user = c.get('user')
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法', issues: parsed.error.issues }, 400)
  return c.json({ user: updateUser(user.id, parsed.data) })
})

/** Home screen payload: streak, hearts, gems plus the path driven by the SRS queue. */
meRoutes.get('/home', (c) => {
  const user = c.get('user')
  const stats = getStats(user.id)
  const deck = deckStats(user.id)
  const due = dueCount(user.id)
  const fresh = newCount(user.id)
  const lessons = listLessons(user.id, 3)

  return c.json({
    user,
    stats: {
      hearts: stats.hearts,
      heartsMax: HEARTS_MAX,
      gems: stats.gems,
      xp: stats.xp,
      streak: stats.streak,
      dailyGoalMin: user.daily_goal_min,
      todaySeconds: stats.daily_seconds,
      // 侧边栏/顶部栏的导师倒计时要用，不能被 /me 独占
      tutorRemainingSeconds: Math.max(0, TUTOR_FREE_SECONDS - stats.tutor_seconds),
      tutorTotalSeconds: TUTOR_FREE_SECONDS,
      heartRefillSeconds: stats.hearts_refill_at
        ? Math.max(0, Math.round((stats.hearts_refill_at - Date.now()) / 1000))
        : 0,
    },
    path: buildPath({ due, fresh, deckTotal: deck.total, lessons, stats, dailyGoalMin: user.daily_goal_min }),
  })
})

function buildPath(input: {
  due: number
  fresh: number
  deckTotal: number
  lessons: { id: string; title: string; status: string; completed_at: number | null }[]
  stats: { daily_seconds: number; streak: number }
  dailyGoalMin: number
}) {
  const { due, fresh, deckTotal, lessons, stats, dailyGoalMin } = input
  const nodes: {
    key: string
    label: string
    kind: 'review' | 'capture' | 'lesson' | 'done'
    lessonId?: string
    meta: string
    state: 'done' | 'current' | 'locked'
  }[] = []

  nodes.push({
    key: 'capture',
    label: '拍照加词',
    kind: 'capture',
    meta: deckTotal === 0 ? '先从一张照片开始' : `词库 ${deckTotal} 个`,
    state: deckTotal === 0 ? 'current' : 'done',
  })

  const doneLessons = lessons.filter((l) => l.status === 'completed')
  for (const lesson of doneLessons.slice(0, 2).reverse()) {
    nodes.push({
      key: lesson.id,
      label: lesson.title,
      kind: 'done',
      lessonId: lesson.id,
      meta: '已完成',
      state: 'done',
    })
  }

  if (due > 0) {
    nodes.push({
      key: 'review',
      label: '遗忘曲线复习',
      kind: 'review',
      meta: `${due} 个词到期`,
      state: 'current',
    })
  } else if (fresh > 0) {
    nodes.push({
      key: 'new',
      label: '新词课程',
      kind: 'lesson',
      meta: `${fresh} 个新词待学`,
      state: 'current',
    })
  } else {
    nodes.push({
      key: 'learn',
      label: '开始一节课',
      kind: 'lesson',
      meta: deckTotal > 0 ? 'AI 生成练习' : '先添加单词',
      state: deckTotal > 0 ? 'current' : 'locked',
    })
  }

  const goalReached = stats.daily_seconds / 60 >= dailyGoalMin
  nodes.push({
    key: 'goal',
    label: goalReached ? '今日目标已完成' : '今日目标',
    kind: 'lesson',
    meta: `${Math.floor(stats.daily_seconds / 60)} / ${dailyGoalMin} 分钟`,
    state: goalReached ? 'done' : 'locked',
  })

  return { nodes, due, fresh, deckTotal }
}

meRoutes.get('/leaderboard', (c) => c.json(leaderboard(c.get('user').id)))

meRoutes.get('/quests', (c) => c.json({ quests: quests(c.get('user').id) }))

meRoutes.post('/hearts/refill', (c) => {
  const result = refillHearts(c.get('user').id, 50)
  if (!result.ok) return c.json({ error: result.reason }, 400)
  return c.json({ stats: getStats(c.get('user').id) })
})

meRoutes.post('/hearts/spend', (c) => c.json({ stats: spendHeart(c.get('user').id) }))

/** Shop: gems, hearts, boosts. Payments are simulated (no real money in this build). */
meRoutes.get('/shop', (c) => {
  const stats = getStats(c.get('user').id)
  return c.json({
    gems: stats.gems,
    hearts: stats.hearts,
    tabs: [
      {
        id: 'gems',
        label: '宝石',
        packs: [
          { id: 'g500', amount: 500, price: '¥18' },
          { id: 'g1200', amount: 1200, price: '¥38', hot: true },
          { id: 'g2500', amount: 2500, price: '¥68' },
        ],
      },
      {
        id: 'hearts',
        label: '心',
        packs: [
          { id: 'h1', amount: 1, price: '20 宝石' },
          { id: 'h5', amount: 5, price: '80 宝石', hot: true },
        ],
      },
      {
        id: 'boost',
        label: '强化',
        packs: [
          { id: 'b_streak', amount: 1, price: '200 宝石' },
          { id: 'b_xp', amount: 1, price: '120 宝石' },
        ],
      },
    ],
    items: [
      { id: 'infinite_hearts', icon: 'heart', title: '无限心 · 1 天', subtitle: '24 小时内答错不扣心', price: '50 宝石', gems: 50 },
      { id: 'streak_freeze', icon: 'shield', title: '连续保护', subtitle: '错过一天也不会断连', price: '200 宝石', gems: 200 },
    ],
  })
})

const buySchema = z.object({ id: z.string(), gems: z.number().int().min(0).optional() })

meRoutes.post('/shop/buy', async (c) => {
  const parsed = buySchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: '参数不合法' }, 400)
  const cost = parsed.data.gems ?? 0
  const stats = getStats(c.get('user').id)
  if (cost > 0 && stats.gems < cost) return c.json({ error: '宝石不足' }, 400)
  if (cost > 0) addGems(c.get('user').id, -cost)
  return c.json({ ok: true, stats: getStats(c.get('user').id) })
})

/** Dashboard numbers for the review heatmap on the "me" screen. */
meRoutes.get('/insights', (c) => {
  const user = c.get('user')
  const items = getItems(user.id)
  const buckets = [
    { label: '脆弱', min: 0, max: 0.5, color: '#FF4B4B' },
    { label: '不稳', min: 0.5, max: 0.75, color: '#FFB420' },
    { label: '稳固', min: 0.75, max: 0.9, color: '#1FB6F0' },
    { label: '牢记', min: 0.9, max: 1.01, color: '#3FC161' },
  ].map((b) => ({
    ...b,
    count: items.filter((i) => {
      const r = currentRetrievability(i)
      return i.srs_state !== 'new' && r >= b.min && r < b.max
    }).length,
  }))
  return c.json({ buckets, total: items.length })
})
