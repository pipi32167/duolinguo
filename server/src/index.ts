import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from './env.js'
import './db/index.js'
import { getAiConfig, publicAiConfig } from './ai/config.js'
import { session, type AppEnv } from './http/session.js'
import { aiRoutes } from './routes/ai.js'
import { extractRoutes } from './routes/extract.js'
import { deckRoutes } from './routes/deck.js'
import { lessonRoutes } from './routes/lessons.js'
import { reviewRoutes } from './routes/review.js'
import { tutorRoutes } from './routes/tutor.js'
import { meRoutes } from './routes/me.js'

const app = new Hono<AppEnv>()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['content-type', 'x-device-id', 'x-admin-token', 'x-target-lang', 'authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
)

app.get('/api/health', (c) => {
  const cfg = getAiConfig()
  return c.json({
    ok: true,
    time: new Date().toISOString(),
    ai: { configured: Boolean(cfg.baseUrl && cfg.apiKey), mock: cfg.mock },
  })
})

/** Bootstrap payload so the client knows whether AI + onboarding are ready. */
app.get('/api/bootstrap', (c) =>
  c.json({
    needsOnboardingQuery: true,
    ai: publicAiConfig(),
    adminProtected: Boolean(env.adminToken),
  }),
)

app.use('/api/*', session())

app.route('/api', aiRoutes)
app.route('/api', extractRoutes)
app.route('/api', deckRoutes)
app.route('/api', lessonRoutes)
app.route('/api', reviewRoutes)
app.route('/api', tutorRoutes)
app.route('/api', meRoutes)

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error('[server]', err)
  return c.json({ error: err.message || '服务器内部错误' }, 500)
})

serve({ fetch: app.fetch, port: env.port }, (info) => {
  const cfg = getAiConfig()
  console.log(`\n  Lingo API  →  http://localhost:${info.port}`)
  console.log(`  AI         →  ${cfg.mock ? 'MOCK 模式' : cfg.baseUrl || '(未配置 baseurl)'}`)
  console.log(`  text model →  ${cfg.model}`)
  console.log(`  vision     →  ${cfg.visionModel || '(未配置)'}`)
  if (!cfg.mock && (!cfg.baseUrl || !cfg.apiKey)) {
    console.log('  ⚠️  尚未配置 AI，请编辑 server/.env 或访问 /admin 页面\n')
  } else {
    console.log('')
  }
})
