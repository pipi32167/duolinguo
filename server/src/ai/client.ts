import { getAiConfig } from './config.js'

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  json?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

function joinUrl(base: string, suffix: string): string {
  if (!base) throw new AiError('AI base URL 未配置')
  const b = base.replace(/\/+$/, '')
  // accept both "https://host" and "https://host/v1" forms
  return /\/v\d+$/.test(b) ? `${b}${suffix}` : `${b}/v1${suffix}`
}

export function chatEndpoint(baseUrl = getAiConfig().baseUrl): string {
  return joinUrl(baseUrl, '/chat/completions')
}

async function request(messages: ChatMessage[], opts: ChatOptions & { stream?: boolean }) {
  const cfg = getAiConfig()
  const model = opts.model || cfg.model
  if (!cfg.apiKey) throw new AiError('AI API Key 未配置')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? cfg.timeoutMs)
  if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true })

  let res: Response
  try {
    res = await fetch(chatEndpoint(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? cfg.temperature,
        max_tokens: opts.maxTokens ?? 4096,
        stream: opts.stream ?? false,
        ...(opts.json && !opts.stream ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') throw new AiError('AI 请求超时', 408)
    throw new AiError(`AI 请求失败：${(err as Error).message}`)
  }
  clearTimeout(timeout)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new AiError(explainHttp(res.status, body), res.status, body.slice(0, 2000))
  }
  return res
}

function explainHttp(status: number, body: string): string {
  if (status === 401 || status === 403) return 'AI 鉴权失败，请检查 API Key'
  if (status === 404) return 'AI 接口或模型不存在（检查 baseurl / model 名称）'
  if (status === 429) return 'AI 触发限流，请稍后重试'
  if (body.includes('does not support image')) return '当前模型不支持图片输入，请在后台配置视觉模型'
  return `AI 返回 ${status}：${body.slice(0, 300)}`
}

export async function chatText(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await request(messages, opts)
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new AiError('AI 返回内容为空')
  return text
}

/** Streaming chat — yields text deltas. */
export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const res = await request(messages, { ...opts, stream: true })
  const body = res.body
  if (!body) throw new AiError('AI 流式响应为空')

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore malformed keep-alive chunks
      }
    }
  }
}

export interface VisionInput {
  dataUrl: string
  mime: string
}

export async function chatVision(
  system: string,
  userText: string,
  image: VisionInput,
  opts: ChatOptions = {},
): Promise<string> {
  const cfg = getAiConfig()
  return chatText(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: image.dataUrl, detail: 'high' } },
        ],
      },
    ],
    { model: opts.model || cfg.visionModel, ...opts },
  )
}

/**
 * Extract the first JSON object/array from a model reply. Models sometimes wrap
 * JSON in prose or markdown fences even when asked not to.
 */
export function parseJsonLoose(raw: string): unknown {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    /* fall through to brace scanning */
  }

  const start = cleaned.search(/[[{]/)
  if (start < 0) throw new AiError('AI 未返回 JSON')
  const open = cleaned[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1))
    }
  }
  throw new AiError('AI 返回的 JSON 不完整')
}

/**
 * Ask the model for JSON and validate it. On validation failure the model gets
 * one chance to repair its own output.
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  validate: (value: unknown) => T,
  opts: ChatOptions = {},
): Promise<{ data: T; raw: string; repaired: boolean }> {
  const raw = await chatText(messages, { ...opts, json: true })
  try {
    return { data: validate(parseJsonLoose(raw)), raw, repaired: false }
  } catch (first) {
    const retry = await chatText(
      [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 4000) },
        {
          role: 'user',
          content: `上面的输出不合法（${(first as Error).message}）。只返回修正后的合法 JSON，不要任何解释、不要 markdown 代码块。`,
        },
      ],
      { ...opts, json: true },
    )
    return { data: validate(parseJsonLoose(retry)), raw: retry, repaired: true }
  }
}

export async function checkConnection(model: string): Promise<{ ok: boolean; error?: string; ms: number }> {
  const started = Date.now()
  try {
    await chatText([{ role: 'user', content: 'ping' }], { model, maxTokens: 8, temperature: 0 })
    return { ok: true, ms: Date.now() - started }
  } catch (err) {
    return { ok: false, error: (err as Error).message, ms: Date.now() - started }
  }
}

export const AI_JSON_RULE =
  '严格只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释性文字、不要注释。所有字符串使用 UTF-8 中文/目标语言原文。'
