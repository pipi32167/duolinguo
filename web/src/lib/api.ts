import { deviceId, readProfile } from './device'
import type {
  AiStatus,
  DeckStats,
  ExtractResponse,
  HomePayload,
  Item,
  ItemCurve,
  LeaderRow,
  Lesson,
  MePayload,
  Quest,
  QueueEntry,
  ShopPayload,
  Stats,
  TutorPayload,
  Exercise,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly payload?: unknown

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const profile = readProfile()
  return {
    'x-device-id': deviceId(),
    // Header values must be ISO-8859-1; the label is Chinese, so percent-encode it.
    'x-target-lang': encodeURIComponent(profile.langLabel),
    ...extra,
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } })
  } catch {
    throw new ApiError('无法连接后端服务，请确认 server 已启动', 0, 'NETWORK')
  }

  const text = await res.text()
  let body: unknown = undefined
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = text
  }

  if (!res.ok) {
    const err = body as { error?: string; code?: string } | undefined
    throw new ApiError(err?.error ?? `请求失败（${res.status}）`, res.status, err?.code, body)
  }
  return body as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  bootstrap: () =>
    request<{ ai: AiStatus; adminProtected: boolean }>('/bootstrap'),

  aiStatus: () => request<AiStatus>('/ai/status'),

  aiAdminConfig: () => request<AiStatus>('/ai/admin/config'),

  aiAdminEndpoint: () => request<{ endpoint: string }>('/ai/admin/endpoint'),

  saveAiConfig: (patch: Record<string, unknown>) =>
    request<AiStatus>('/ai/admin/config', json('PUT', patch)),

  resetAiConfig: () => request<AiStatus>('/ai/admin/config', json('DELETE')),

  testAi: () =>
    request<{
      ok: boolean
      error?: string
      baseUrlHost?: string
      endpoint?: string
      text: { ok: boolean; error?: string; ms: number; model?: string }
      vision: { ok: boolean; error?: string; ms: number; model?: string }
      note?: string
    }>('/ai/test', json('POST')),

  /* ---- recognition ---- */
  extractImage: (file: Blob | File, focus = '') => {
    const form = new FormData()
    form.append('image', file, 'capture.jpg')
    if (focus) form.append('focus', focus)
    return request<ExtractResponse>('/extract', { method: 'POST', body: form })
  },

  /* ---- deck ---- */
  items: (params: { q?: string; type?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.type && params.type !== 'all') qs.set('type', params.type)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request<{ items: Item[] }>(`/items${suffix}`)
  },

  item: (id: string) => request<{ item: Item; curve: ItemCurve }>(`/items/${id}`),

  updateItem: (id: string, patch: Partial<Item>) =>
    request<{ item: Item }>(`/items/${id}`, json('PATCH', patch)),

  deleteItems: (ids: string[]) =>
    request<{ deleted: number }>('/items/delete', json('POST', { ids })),

  resetItem: (id: string) => request<{ item: Item; curve: ItemCurve }>(`/items/${id}/reset`, json('POST')),

  deckStats: () =>
    request<{
      stats: DeckStats
      heatmap: { day: string; total: number; correct: number }[]
      images: { id: string; status: string; model: string | null; created_at: number }[]
    }>('/deck/stats'),

  /* ---- forgetting curve review ---- */
  reviewQueue: (limit = 20) =>
    request<{
      due: number
      fresh: number
      stats: DeckStats
      entries: QueueEntry[]
    }>(`/review/queue?limit=${limit}`),

  gradeReview: (itemId: string, grade: 1 | 2 | 3 | 4, ms = 0) =>
    request<{
      item: Item
      intervalDays: number
      nextDue: number
      correct: boolean
      preview: { grade: number; label: string; intervalDays: number; dueAt: number }[]
      remaining: { due: number; fresh: number }
    }>('/review/grade', json('POST', { itemId, grade, ms })),

  /* ---- lessons ---- */
  generateLesson: (payload: { itemIds?: string[]; theme?: string; size?: number; title?: string }) =>
    request<{ lesson: Lesson; intro?: string; exercises: Exercise[] }>('/lessons', json('POST', payload)),

  lesson: (id: string) => request<{ lesson: Lesson; intro?: string; exercises: Exercise[] }>(`/lessons/${id}`),

  lessons: () => request<{ lessons: Lesson[] }>('/lessons'),

  completeLesson: (id: string, payload: { xp: number; accuracy: number; durationMs: number; bestCombo?: number }) =>
    request<{ stats: Stats }>(`/lessons/${id}/complete`, json('POST', payload)),

  /* ---- progress / gamification ---- */
  home: () => request<HomePayload>('/home'),

  me: () => request<MePayload>('/me'),

  updateMe: (patch: Record<string, unknown>) => request<{ user: MePayload['user'] }>('/me', json('PATCH', patch)),

  leaderboard: () => request<{ rows: LeaderRow[]; myRank: number; league: string }>('/leaderboard'),

  quests: () => request<{ quests: Quest[] }>('/quests'),

  shop: () => request<ShopPayload>('/shop'),

  buy: (id: string, gems = 0) => request<{ ok: boolean; stats: Stats }>('/shop/buy', json('POST', { id, gems })),

  refillHearts: () => request<{ stats: Stats }>('/hearts/refill', json('POST')),

  spendHeart: () =>
    request<{ stats: Stats & { hearts: number; heartsMax: number; heartRefillSeconds: number } }>(
      '/hearts/spend',
      json('POST'),
    ),

  insights: () =>
    request<{
      buckets: { label: string; min: number; max: number; color: string; count: number }[]
      total: number
    }>('/insights'),

  /* ---- tutor ---- */
  tutor: () => request<TutorPayload>('/tutor'),

  clearTutor: () => request<{ ok: boolean }>('/tutor', json('DELETE')),
}

/** Direct (non-`request`) export used by the SSE tutor stream. */
export function tutorEndpoint(): string {
  return `${BASE}/tutor`
}

export function authHeaders(): Record<string, string> {
  return headers({ 'content-type': 'application/json' })
}
