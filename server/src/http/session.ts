import type { Context, Next } from 'hono'
import { ensureUser, getStats, type StatsRow, type UserRow } from '../db/repo.js'

export interface AppEnv {
  Variables: {
    user: UserRow
    stats: StatsRow
    deviceId: string
  }
}

export type AppContext = Context<AppEnv>

const DEVICE_RE = /^[A-Za-z0-9_-]{6,64}$/

/**
 * Anonymous device session: the browser keeps a UUID in localStorage and sends
 * it as `x-device-id`. No signup wall, but every row is still scoped to a user.
 */
export function session() {
  return async (c: AppContext, next: Next) => {
    let deviceId = c.req.header('x-device-id') ?? c.req.query('device') ?? ''
    if (!DEVICE_RE.test(deviceId)) deviceId = 'anonymous-default'
    const user = ensureUser(deviceId)
    c.set('deviceId', deviceId)
    c.set('user', user)
    c.set('stats', getStats(deviceId))
    await next()
  }
}

export function requireAdmin() {
  return async (c: AppContext, next: Next) => {
    const { adminToken } = await import('../env.js').then((m) => m.env)
    if (!adminToken) return next()
    const provided =
      c.req.header('x-admin-token') ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (provided !== adminToken) return c.json({ error: '需要管理员令牌' }, 401)
    return next()
  }
}
