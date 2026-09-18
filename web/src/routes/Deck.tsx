import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { EmptyState, ErrorBox, Loading } from '../components/State'
import { Camera, Deck as DeckIcon, Sparkle, Trash } from '../components/Icons'
import { RetentionMeter } from '../components/ForgettingCurve'
import { ApiError, api } from '../lib/api'
import { useAsync, useToast } from '../lib/hooks'
import { SRS_STATE_LABEL, formatRelativeDue, pct, retentionColor, retentionLabel } from '../lib/format'
import type { Item } from '../lib/types'

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'due', label: '今日到期' },
  { id: 'new', label: '新词' },
  { id: 'weak', label: '易忘' },
  { id: 'word', label: '单词' },
  { id: 'phrase', label: '短语' },
] as const

/** 词库 · 所有识别出来的词条 + 遗忘曲线状态 */
export function DeckRoute() {
  const navigate = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const list = useAsync(() => api.items(), [])
  const stats = useAsync(() => api.deckStats(), [])
  const now = Date.now()

  const items = useMemo(() => {
    const all = list.data?.items ?? []
    const needle = q.trim().toLowerCase()
    return all.filter((item) => {
      if (filter === 'due' && !(item.srs_state !== 'new' && item.due_at <= now)) return false
      if (filter === 'new' && item.srs_state !== 'new') return false
      if (filter === 'weak' && item.lapses === 0) return false
      if ((filter === 'word' || filter === 'phrase') && item.type !== filter) return false
      if (!needle) return true
      return (
        item.text.toLowerCase().includes(needle) ||
        item.translation.includes(needle) ||
        (item.topic ?? '').toLowerCase().includes(needle)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, q, filter])

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const generate = async () => {
    if (!picked.size) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await api.generateLesson({ itemIds: Array.from(picked) })
      navigate(`/lesson/${res.lesson.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成课程失败')
    } finally {
      setBusy(false)
    }
  }

  const removePicked = async () => {
    if (!picked.size) return
    const ids = Array.from(picked)
    setPicked(new Set())
    list.setData((prev) => (prev ? { items: prev.items.filter((i) => !ids.includes(i.id)) } : prev))
    try {
      await api.deleteItems(ids)
      toast.show(`已删除 ${ids.length} 个词条`)
      stats.reload()
    } catch {
      toast.show('删除失败，已恢复')
      list.reload()
    }
  }

  const s = stats.data?.stats

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page">
        <TopBar />

        <h1 className="h2">我的词库</h1>
        <p className="lede">
          {s
            ? `${s.total} 个词条 · ${s.due} 个今日到期 · 平均记住率 ${pct(s.avgRetention)}`
            : '正在读取…'}
        </p>

        {s && s.total > 0 && (
          <div className="heatmap" style={{ marginTop: 14 }}>
            {(['new', 'learning', 'review', 'relearning'] as const).map((state) =>
              Array.from({ length: Math.min(s.byState[state] ?? 0, 40) }, (_, i) => (
                <i
                  key={`${state}-${i}`}
                  title={`${SRS_STATE_LABEL[state]} · ${s.byState[state]} 个`}
                  style={{ background: STATE_COLOR[state] }}
                />
              )),
            )}
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 18 }}>
          <input
            className="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索单词 / 释义 / 主题"
            aria-label="搜索词库"
          />
          <button className="btn btn-sm btn-outline" onClick={() => navigate('/capture')}>
            <Camera size={18} />
            加词
          </button>
        </div>

        <div className="pills" style={{ flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`pill${filter === f.id ? ' is-on' : ''}`}
              onClick={() => setFilter(f.id)}
              style={{ flex: 'none', padding: '9px 14px' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <ErrorBox message={error} />}
        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading label="正在读取词库…" />}

        {list.data && items.length === 0 && (
          <EmptyState
            icon={<DeckIcon size={26} />}
            title={list.data.items.length === 0 ? '词库还是空的' : '没有符合条件的词'}
            hint={
              list.data.items.length === 0
                ? '拍一张课本或菜单的照片，AI 会把里面的单词和短语提取出来。'
                : '换个筛选条件或清空搜索词试试。'
            }
            action={
              list.data.items.length === 0 ? (
                <button className="btn" onClick={() => navigate('/capture')}>
                  <Camera size={20} />
                  拍照加词
                </button>
              ) : undefined
            }
          />
        )}

        {items.length > 0 && (
          <>
            {picked.size > 0 && (
              <div className="card" style={{ position: 'sticky', top: 8, zIndex: 5, marginBottom: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13.5, fontWeight: 900, flex: 1 }}>已选 {picked.size} 个</b>
                  <button className="btn btn-sm btn-outline" onClick={() => setPicked(new Set())}>
                    取消
                  </button>
                  <button className="btn btn-sm btn-bad" onClick={removePicked}>
                    <Trash size={16} />
                    删除
                  </button>
                  <button className="btn btn-sm" onClick={generate} disabled={busy}>
                    {busy ? <span className="spinner" /> : <Sparkle size={16} />}
                    生成课程
                  </button>
                </div>
              </div>
            )}

            <div className="itemlist itemlist--grid">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  now={now}
                  picked={picked.has(item.id)}
                  onToggle={() => toggle(item.id)}
                  onOpen={() => navigate(`/deck/${item.id}`)}
                />
              ))}
            </div>
          </>
        )}

        <div className="spacer" style={{ minHeight: 24 }} />
        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}

const STATE_COLOR: Record<string, string> = {
  new: 'var(--blue)',
  learning: 'var(--gold)',
  review: 'var(--brand)',
  relearning: 'var(--red)',
}

function ItemRow({
  item,
  now,
  picked,
  onToggle,
  onOpen,
}: {
  item: Item
  now: number
  picked: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const overdue = item.srs_state !== 'new' && item.due_at <= now
  const retention = item.last_review && item.stability > 0 ? estimate(item, now) : 0

  return (
    <div className={`itemrow${picked ? ' is-picked' : ''}`}>
      <button className="ir-main" onClick={onOpen} style={{ background: 'none', textAlign: 'left' }}>
        <span className="ir-t">
          {item.text}
          {item.phonetic && <span className="ir-phon">{item.phonetic}</span>}
        </span>
        <span className="ir-s">
          {item.translation}
          {item.pos ? ` · ${item.pos}` : ''}
        </span>
        <span className="ir-meta">
          <span className={`badge badge--${overdue ? 'due' : item.srs_state}`}>
            {overdue ? '到期' : SRS_STATE_LABEL[item.srs_state]}
          </span>
          <span className="badge badge--ghost">{formatRelativeDue(item.due_at, now)}</span>
          {item.lapses > 0 && <span className="badge badge--relearning">错 {item.lapses} 次</span>}
          {/* 窄屏没位置放进度条，用等价的百分比徽章代替 */}
          {item.srs_state !== 'new' && (
            <span className="badge ir-ret" style={{ color: retentionColor(retention), background: 'var(--soft)' }}>
              {retentionLabel(retention)} {Math.round(retention * 100)}%
            </span>
          )}
        </span>
      </button>

      {item.srs_state !== 'new' && (
        <div className="ir-meter">
          <RetentionMeter value={retention} />
        </div>
      )}

      <button
        className="ir-check"
        style={picked ? { background: 'var(--brand)', borderColor: 'var(--brand)' } : undefined}
        onClick={onToggle}
        aria-label={picked ? `取消选择 ${item.text}` : `选择 ${item.text}`}
        aria-pressed={picked}
      >
        {picked ? '✓' : ''}
      </button>
    </div>
  )
}

/** Mirror of the server's FSRS-4.5 retention formula for instant local display. */
function estimate(item: Item, now: number): number {
  const FACTOR = 19 / 81
  const DAY = 86_400_000
  const elapsed = Math.max((now - (item.last_review ?? now)) / DAY, 0)
  if (item.stability <= 0) return 0
  return Math.pow(1 + (FACTOR * elapsed) / item.stability, -0.5)
}
