import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorBox, Loading } from '../components/State'
import { Back, Clock, Mic, Send, Sparkle, Trash } from '../components/Icons'
import { api, authHeaders, tutorEndpoint } from '../lib/api'
import { useAsync, useToast, useTicker } from '../lib/hooks'
import { listen, sttSupported } from '../lib/speech'
import { formatClock, formatTime } from '../lib/format'
import type { TutorPayload } from '../lib/types'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  at: number
}

/** 12 / 13 · AI 口语导师 · 每日免费时长（SSE 流式，额度耗尽时输入框仍可打字） */
export function Tutor() {
  const navigate = useNavigate()
  const toast = useToast()
  const initial = useAsync(() => api.tutor(), [])

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string>()
  const [remaining, setRemaining] = useState<number>()
  const listRef = useRef<HTMLDivElement>(null)
  const lastTick = useRef(Date.now())

  useEffect(() => {
    if (initial.data) {
      setMessages(
        initial.data.messages.map((m) => ({ role: m.role, content: m.content, at: m.created_at })),
      )
      setRemaining(initial.data.quota.remainingSeconds)
    }
  }, [initial.data])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  /* bill the free quota while the learner is actually talking */
  useTicker(1000)
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = (now - lastTick.current) / 1000
      lastTick.current = now
      if (!streaming && document.visibilityState === 'visible') {
        setRemaining((r) => (r === undefined ? r : Math.max(0, r - delta)))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [streaming])

  const exhausted = remaining !== undefined && remaining <= 0

  const send = useCallback(async () => {
    const content = input.trim()
    if (!content || streaming) return
    if (exhausted) {
      toast.show('今日免费时长已用完，明天 00:00 恢复')
      return
    }

    const secondsSpent = Math.max(0, Math.round((Date.now() - lastTick.current) / 1000))
    lastTick.current = Date.now()

    setMessages((prev) => [...prev, { role: 'user', content, at: Date.now() }])
    setInput('')
    setStreaming(true)
    setError(undefined)

    try {
      const res = await fetch(tutorEndpoint(), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content, secondsSpent }),
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: '发送失败' }))
        if (res.status === 402) setRemaining(0)
        throw new Error(body.error ?? '发送失败')
      }

      // insert the streaming placeholder
      setMessages((prev) => [...prev, { role: 'assistant', content: '', at: Date.now() }])

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim()
          const dataLine = block
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
            .join('')
          if (!dataLine) continue
          let payload: { text?: string; content?: string; remainingSeconds?: number; error?: string }
          try {
            payload = JSON.parse(dataLine)
          } catch {
            continue
          }

          if (event === 'delta' && payload.text) {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + payload.text }
              return next
            })
          } else if (event === 'done') {
            if (typeof payload.remainingSeconds === 'number') setRemaining(payload.remainingSeconds)
          } else if (event === 'error') {
            setError(payload.error ?? 'AI 返回失败')
          }
        }
      }
    } catch (err) {
      setError((err as Error).message)
      setMessages((prev) => prev.filter((m, i) => !(i === prev.length - 1 && m.role === 'assistant' && !m.content)))
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, exhausted, toast])

  const total = initial.data?.quota.totalSeconds ?? 30 * 60
  const pct = remaining === undefined ? 1 : Math.max(0, Math.min(1, remaining / total))

  return (
    <AppShell variant="immersive" onCapture={() => navigate('/capture')}>
      <div className="page page--narrow chat" style={{ minHeight: '100dvh' }}>
        <div className="navbar">
          <button className="nav-back" onClick={() => navigate('/learn')} aria-label="返回">
            <Back size={22} />
          </button>
          <span className="avatar" style={{ ['--ac' as string]: '#5BC8F5' }}>
            {initial.data?.tutor.avatar ?? 'L'}
          </span>
          <span className="nav-meta">
            <b>{initial.data?.tutor.name ?? 'Lina'}</b>
            <i>{initial.data?.tutor.role ?? '口语导师'} · 在线</i>
          </span>
          <button
            className="nav-more"
            onClick={async () => {
              await api.clearTutor().catch(() => undefined)
              setMessages([])
              toast.show('对话已清空')
            }}
            aria-label="清空对话"
          >
            <Trash size={18} />
          </button>
        </div>

        <div className={`quotabar${exhausted ? ' is-empty' : ''}`}>
          <div className="qb-row">
            <span className="qb-label">{exhausted ? '今日免费时长已用完' : '今日免费时长'}</span>
            <span className="qb-time">{formatClock(remaining ?? total)}</span>
          </div>
          <div className="qb-track">
            <i style={{ width: `${pct * 100}%` }} />
          </div>
        </div>

        {error && <ErrorBox message={error} />}
        {initial.error && <ErrorBox message={initial.error} onRetry={initial.reload} />}
        {initial.loading && !initial.data && <Loading label="正在连接导师…" rows={2} />}

        {initial.data?.mock && (
          <div className="alert alert--info" style={{ marginTop: 8 }}>
            <Sparkle size={20} />
            <div>
              <b>当前是 AI_MOCK 模式</b>
              回复来自内置假数据。在 AI 配置里填上 baseurl / apikey / {initial.data.model} 后就是真的对话。
            </div>
          </div>
        )}

        <div className="msgs" ref={listRef}>
          {messages.length === 0 && initial.data && (
            <div className="msg in">
              Hi! 我是 {initial.data.tutor.name}。用{''}目标语言跟我聊聊今天发生的事吧 —— 说错也没关系，我会帮你改。
              <span className="t">{formatTime(Date.now())}</span>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={`${m.at}-${i}`} className={`msg ${m.role === 'user' ? 'out' : 'in'}`}>
              <Rich text={m.content || (streaming ? '' : '…')} />
              {m.content && <span className="t">{formatTime(m.at)}</span>}
            </div>
          ))}

          {streaming && messages[messages.length - 1]?.role === 'user' && (
            <div className="typing">
              <i />
              <i />
              <i />
            </div>
          )}

          {exhausted && (
            <>
              <div className="sysnote">{formatTime(Date.now())} · 今日免费对话时长已达上限</div>
              <div className="limitcard">
                <span className="lc-ic">
                  <Clock size={20} />
                </span>
                <div className="lc-text">
                  <b>明天 00:00 自动恢复</b>
                  <span>免费会员每天 {Math.round(total / 60)} 分钟口语对话</span>
                </div>
              </div>
              <div className="limitcard is-up">
                <span className="lc-ic">
                  <Sparkle size={20} />
                </span>
                <div className="lc-text">
                  <b>升级解锁无限对话</b>
                  <span>随时练口语，不再计时</span>
                </div>
                <button className="lc-btn" onClick={() => navigate('/super')}>
                  升级
                </button>
              </div>
            </>
          )}
        </div>

        <div
          className="composer"
          onClick={(e) => {
            if (exhausted && !(e.target as HTMLElement).closest('input')) {
              toast.show('今日免费时长已用完，明天 00:00 恢复')
            }
          }}
        >
          <button
            className="c-ic"
            aria-label="语音输入"
            onClick={() => {
              if (exhausted) {
                toast.show('今日免费时长已用完，明天 00:00 恢复')
                return
              }
              if (!sttSupported()) {
                toast.show('当前浏览器不支持语音识别，请直接输入文字')
                return
              }
              listen({ onResult: setInput, onError: toast.show })
            }}
          >
            <Mic size={20} />
          </button>

          <div className="input-wrap">
            <input
              className="chat-input"
              value={input}
              placeholder="输入消息…"
              aria-label="聊天输入"
              onChange={(e) => {
                setInput(e.target.value)
                if (exhausted && e.target.value.trim()) toast.show('今日免费时长已用完，明天 00:00 恢复')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
          </div>

          <button
            className={`chat-send${input.trim() && !exhausted ? ' is-on' : ''}`}
            disabled={!input.trim() || exhausted || streaming}
            onClick={() => void send()}
            aria-label="发送"
          >
            {streaming ? <span className="spinner spinner--dark" /> : <Send />}
          </button>
        </div>

        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}

/** Tutor replies come through SSE; render the **bold** markers the prompt asks for. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <b key={i}>{part.slice(2, -2)}</b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export type { TutorPayload }
