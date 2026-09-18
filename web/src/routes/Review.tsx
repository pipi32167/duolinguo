import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { EmptyState, ErrorBox, Loading } from '../components/State'
import { Camera, Check, Refresh, Speaker, Sparkle } from '../components/Icons'
import { ForgettingCurve, RetentionMeter } from '../components/ForgettingCurve'
import { api } from '../lib/api'
import { useAsync, useToast } from '../lib/hooks'
import { speak } from '../lib/speech'
import { REASON_LABEL, SRS_STATE_LABEL, formatRelativeDue } from '../lib/format'
import type { QueueEntry } from '../lib/types'

const GRADE_LABEL: Record<number, string> = { 1: '再来一次', 2: '有点难', 3: '记得', 4: '很简单' }

interface GradeResult {
  itemText: string
  grade: number
  intervalDays: number
}

/** 遗忘曲线复习 —— 在三合一的队列里按到期 / 易忘 / 新词依次回忆并评分 */
export function ReviewRoute() {
  const navigate = useNavigate()
  const toast = useToast()
  const [limit] = useState(20)
  const queue = useAsync(() => api.reviewQueue(limit), [])

  /**
   * The review session owns its own snapshot of the queue. We deliberately do
   * NOT re-render off `queue.data` while grading — refetching mid-session would
   * reset the index/progress and lose the answers already given.
   */
  const [session, setSession] = useState<QueueEntry[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<GradeResult[]>([])
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!queue.data) return
    setSession(queue.data.entries)
    setIndex(0)
    setRevealed(false)
    setResults([])
    setDone(false)
    setStartedAt(Date.now())
  }, [queue.data])

  const entries = session ?? []
  const current = entries[index] as QueueEntry | undefined

  const stats = useMemo(() => {
    const correct = results.filter((r) => r.grade > 1).length
    return {
      total: results.length,
      correct,
      accuracy: results.length ? correct / results.length : 0,
    }
  }, [results])

  const grade = async (g: 1 | 2 | 3 | 4) => {
    if (!current || busy) return
    setBusy(true)
    try {
      const res = await api.gradeReview(current.item.id, g, Date.now() - startedAt)
      setResults((prev) => [...prev, { itemText: current.item.text, grade: g, intervalDays: res.intervalDays }])
      if (index + 1 >= entries.length) {
        setDone(true)
      } else {
        setIndex((i) => i + 1)
        setRevealed(false)
        setStartedAt(Date.now())
      }
    } catch {
      toast.show('评分失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------------------------------- states */

  if (queue.loading && !queue.data) {
    return (
      <Shell navigate={navigate}>
        <TopBar />
        <Loading label="正在按遗忘曲线排复习队列…" rows={2} />
      </Shell>
    )
  }

  if (queue.error) {
    return (
      <Shell navigate={navigate}>
        <TopBar />
        <ErrorBox message={queue.error} onRetry={queue.reload} />
      </Shell>
    )
  }

  if (!entries.length || done) {
    const deckTotal = queue.data?.stats.total ?? 0
    const fresh = queue.data?.fresh ?? 0
    const due = queue.data?.due ?? 0
    return (
      <Shell navigate={navigate}>
        <TopBar />
        {done ? (
          <Summary
            total={stats.total}
            correct={stats.correct}
            accuracy={stats.accuracy}
            results={results}
            onAgain={queue.reload}
            onHome={() => navigate('/learn')}
          />
        ) : deckTotal === 0 ? (
          <EmptyState
            icon={<Camera size={28} />}
            title="词库还是空的"
            hint="拍一张课本或菜单的照片，AI 会把里面的单词和短语提取出来，遗忘曲线就从那一刻开始算。"
            action={
              <button className="btn" onClick={() => navigate('/capture')}>
                <Camera size={20} />
                拍照加词
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<Check size={28} />}
            title="今天的复习都做完了"
            hint={
              due > 0
                ? `还有 ${due} 张卡刚刚到期，再刷一轮就能清空。`
                : fresh > 0
                  ? `还有 ${fresh} 个新词没学过，先去做一节新词课程。`
                  : `词库里有 ${deckTotal} 个词，都还在记忆保鲜期内 —— 下一次到期会自动出现在这里。`
            }
            action={
              due > 0 ? (
                <button className="btn" onClick={queue.reload}>
                  <Refresh size={20} />
                  再刷一轮
                </button>
              ) : (
                <button className="btn" onClick={() => navigate('/learn')}>
                  <Sparkle size={20} />
                  回到学习页
                </button>
              )
            }
          />
        )}
      </Shell>
    )
  }

  const total = entries.length
  const progress = (results.length / total) * 100
  const elapsedDays = current?.item.last_review
    ? Math.max(0, (Date.now() - current.item.last_review) / 86_400_000)
    : 0

  const markers = (current?.preview ?? []).map((p) => ({
    grade: p.grade,
    label: p.label,
    day: p.intervalDays,
  }))

  return (
    <Shell navigate={navigate} player>
      <TopBar />
      <div className="lessonbar">
        <button className="xbtn" onClick={() => navigate('/learn')} aria-label="退出复习">
          ✕
        </button>
        <div className="lprog">
          <i style={{ width: `${progress}%` }} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--muted)' }}>
          {results.length}/{total}
        </span>
      </div>

      {current && (
        <div className={`lessonbody${revealed ? '' : ' lessonbody--center'}`}>
          <div className="review-meta">
            <span className={`badge badge--${current.reason === 'due' ? 'due' : 'ghost'}`}>
              {REASON_LABEL[current.reason]}
            </span>
            <span className={`badge badge--${current.item.srs_state}`}>
              {SRS_STATE_LABEL[current.item.srs_state]}
            </span>
            {current.item.lapses > 0 && <span className="badge badge--relearning">错 {current.item.lapses} 次</span>}
          </div>

          <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
            <p className="q-kicker">{revealed ? '还记得吗？给自己打分' : '先在心里回想一下'}</p>
            <h1 className="q-title" style={{ fontSize: 'clamp(28px, 6vw, 40px)', marginTop: 16 }}>
              {current.item.text}
            </h1>
            <button
              className="speaker"
              style={{ margin: '18px auto 0' }}
              onClick={() => speak(current.item.text)}
              aria-label="朗读"
            >
              <Speaker size={20} />
            </button>

            {revealed && (
              <div style={{ marginTop: 26, animation: 'fade var(--t-fade)' }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--brand-deep)' }}>
                  {current.item.translation}
                </p>
                {current.item.phonetic && (
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--muted)', marginTop: 8 }}>
                    {current.item.phonetic}
                  </p>
                )}
                {current.item.example && (
                  <div className="panel" style={{ marginTop: 18, textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        className="speaker"
                        style={{ width: 32, height: 32 }}
                        onClick={() => speak(current.item.example!)}
                        aria-label="朗读例句"
                      >
                        <Speaker size={16} />
                      </button>
                      <div>
                        <p style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.5 }}>{current.item.example}</p>
                        {current.item.example_zh && (
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginTop: 4 }}>
                            {current.item.example_zh}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {revealed && (
            <>
              <div className="review-curve">
                <ForgettingCurve
                  curve={curveFor(current, elapsedDays, markers)}
                  elapsedDays={elapsedDays}
                  retrievability={current.retrievability}
                  markers={markers}
                  height={128}
                />
              </div>

              <div className="review-retention">
                <RetentionMeter value={current.retrievability} />
                <span>上次 {formatRelativeDue(current.item.last_review ?? 0, Date.now())}</span>
              </div>
            </>
          )}
        </div>
      )}

      {current && !revealed && (
        <div className="lessonfoot">
          <button className="btn btn-block" onClick={() => setRevealed(true)}>
            显示答案
          </button>
        </div>
      )}

      {current && revealed && (
        <div className="lessonfoot">
          <div className="grades">
            {([1, 2, 3, 4] as const).map((g) => {
              const p = current.preview.find((x) => x.grade === g)
              const days = p?.intervalDays ?? 0
              const short =
                days < 1 / 24 ? `${Math.max(1, Math.round(days * 1440))} 分钟` : `${Math.max(1, Math.round(days))} 天`
              return (
                <button
                  key={g}
                  className={`grade grade--${g}`}
                  onClick={() => grade(g)}
                  disabled={busy}
                  aria-label={`${GRADE_LABEL[g]}，下次复习 ${short}后`}
                >
                  <b>{GRADE_LABEL[g]}</b>
                  <span>{short}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {toast.message && <span className="toast is-on">{toast.message}</span>}
    </Shell>
  )
}

function Shell({
  children,
  navigate,
  player,
}: {
  children: React.ReactNode
  navigate: (to: string) => void
  /** 会话中：不显示底部 Tab，并把内容按「顶栏 / 可滚动主体 / 钉底按钮」排布 */
  player?: boolean
}) {
  return (
    <AppShell variant={player ? 'immersive' : 'tabs'} onCapture={() => navigate('/capture')}>
      <div className={`page page--narrow${player ? ' page--player' : ''}`}>{children}</div>
    </AppShell>
  )
}

/**
 * The queue endpoint returns the retention curve for the four *outcomes*, not
 * the future projection, so we derive a projection locally with the same
 * formula the server uses.
 */
function curveFor(entry: QueueEntry, elapsedDays: number, markers: { day: number }[]) {
  const FACTOR = 19 / 81
  const maxDay = Math.min(60, Math.max(14, ...markers.map((m) => m.day), elapsedDays * 2))
  const samples = 60
  const S = Math.max(entry.item.stability, 0.4)
  const out: { day: number; retention: number }[] = []
  for (let i = 0; i <= samples; i++) {
    const day = (maxDay * i) / samples
    out.push({
      day: Number(day.toFixed(3)),
      retention: Number(Math.pow(1 + (FACTOR * day) / S, -0.5).toFixed(4)),
    })
  }
  return out
}

function Summary({
  total,
  correct,
  accuracy,
  results,
  onAgain,
  onHome,
}: {
  total: number
  correct: number
  accuracy: number
  results: GradeResult[]
  onAgain: () => void
  onHome: () => void
}) {
  const graduated = results.filter((r) => r.intervalDays >= 1)
  const avgInterval = graduated.length
    ? graduated.reduce((a, r) => a + r.intervalDays, 0) / graduated.length
    : 0

  return (
    <div style={{ textAlign: 'center', paddingTop: 20 }}>
      <div className="burst" style={{ margin: '14px auto 30px' }}>
        <Check size={52} />
      </div>
      <h1 className="h2" style={{ fontSize: 30 }}>
        复习完成！
      </h1>
      <p className="lede">遗忘曲线已经按你今天的表现重新排好了</p>

      <div className="statcards">
        <div className="sc">
          <span className="sc-n" style={{ color: 'var(--brand)' }}>
            {total}
          </span>
          <span className="sc-l">复习卡片</span>
        </div>
        <div className="sc">
          <span className="sc-n" style={{ color: 'var(--blue)' }}>
            {(accuracy * 100).toFixed(0)}%
          </span>
          <span className="sc-l">记住率</span>
        </div>
        <div className="sc">
          <span className="sc-n" style={{ color: 'var(--gold)' }}>
            {avgInterval >= 1 ? `${Math.round(avgInterval)}天` : '—'}
          </span>
          <span className="sc-l">平均下次间隔</span>
        </div>
      </div>

      {results.some((r) => r.grade === 1) && (
        <div className="alert alert--warn" style={{ textAlign: 'left' }}>
          <Refresh size={20} />
          <div>
            <b>{results.filter((r) => r.grade === 1).length} 张卡被打回重学</b>
            它们会在 10 分钟后重新出现，记忆稳定度也被调低了 —— 这是正常的，说明算法抓到了你的薄弱点。
          </div>
        </div>
      )}

      <div className="card" style={{ textAlign: 'left', marginTop: 16 }}>
        <b style={{ fontSize: 13.5, fontWeight: 900, display: 'block', marginBottom: 10 }}>今日明细</b>
        {results.slice(0, 12).map((r, i) => (
          <div className="kv" key={`${r.itemText}-${i}`}>
            <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{r.itemText}</span>
            <b>
              {GRADE_LABEL[r.grade]} ·{' '}
              {r.intervalDays < 1 / 24
                ? `${Math.max(1, Math.round(r.intervalDays * 1440))} 分钟`
                : `${Math.max(1, Math.round(r.intervalDays))} 天`}
            </b>
          </div>
        ))}
        {results.length > 12 && (
          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginTop: 10 }}>
            还有 {results.length - 12} 条…
          </p>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn btn-block" onClick={onHome}>
          <Sparkle size={20} />
          回到学习页
        </button>
        <button className="btn-ghost" onClick={onAgain}>
          再刷一轮
        </button>
      </div>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginTop: 14 }}>
        答对 {correct} / {total}
      </p>
    </div>
  )
}
