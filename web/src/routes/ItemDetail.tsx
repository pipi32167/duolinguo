import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, Loading } from '../components/State'
import { Back, Pencil, Refresh, Sparkle, Speaker, Trash } from '../components/Icons'
import { ForgettingCurve, RetentionMeter } from '../components/ForgettingCurve'
import { api } from '../lib/api'
import { useAsync, useToast } from '../lib/hooks'
import { speak } from '../lib/speech'
import { SRS_STATE_LABEL, formatRelativeDue, retentionLabel } from '../lib/format'
import type { Item, ItemType } from '../lib/types'

const GRADE_LABEL: Record<number, string> = { 1: '再来一次', 2: '有点难', 3: '记得', 4: '很简单' }

/** 词条详情 · 遗忘曲线可视化 + 手动评分 + 编辑 */
export function ItemDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const { data, error, loading, reload, setData } = useAsync(() => api.item(id), [id])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading && !data) {
    return (
      <AppShell onCapture={() => navigate('/capture')}>
        <div className="page page--narrow">
          <TopBar left={<BackButton onClick={() => navigate(-1)} />} />
          <Loading label="正在读取词条…" />
        </div>
      </AppShell>
    )
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="page page--narrow">
          <TopBar left={<BackButton onClick={() => navigate(-1)} />} />
          <ErrorBox message={error ?? '词条不存在'} onRetry={reload} />
        </div>
      </AppShell>
    )
  }

  const { item, curve } = data
  const now = Date.now()
  const elapsedDays = item.last_review ? Math.max(0, (now - item.last_review) / 86_400_000) : 0

  const grade = async (g: 1 | 2 | 3 | 4) => {
    setBusy(true)
    try {
      const res = await api.gradeReview(item.id, g)
      setData({ item: res.item, curve: { ...curve, ...(await api.item(item.id)).curve } })
      toast.show(`${GRADE_LABEL[g]} · 下次复习在 ${Math.max(1, Math.round(res.intervalDays))} 天后`)
    } catch {
      toast.show('评分失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      const res = await api.resetItem(item.id)
      setData(res)
      toast.show('已重置为「新词」')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    await api.deleteItems([item.id])
    toast.show('已删除')
    navigate('/deck', { replace: true })
  }

  const markers = curve.preview.map((p, idx) => ({
    grade: idx + 1,
    label: GRADE_LABEL[idx + 1],
    day: p.intervalDays,
  }))

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page page--narrow">
        <TopBar left={<BackButton onClick={() => navigate(-1)} />} />

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {item.text}
                <button
                  className="iconbtn"
                  style={{ width: 34, height: 34 }}
                  onClick={() => speak(item.text, { lang: item.type === 'sentence' ? undefined : 'en' })}
                  aria-label="朗读"
                >
                  <Speaker size={18} />
                </button>
              </h1>
              {item.phonetic && (
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--muted)', marginTop: 6 }}>{item.phonetic}</p>
              )}
              <p style={{ fontSize: 18, fontWeight: 900, marginTop: 10 }}>{item.translation}</p>
              {item.pos && (
                <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginTop: 4 }}>{item.pos}</p>
              )}
            </div>
            <span className={`badge badge--${item.srs_state}`}>{SRS_STATE_LABEL[item.srs_state]}</span>
          </div>

          {item.example && (
            <div className="panel" style={{ marginTop: 16, padding: '13px 15px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <button
                  className="speaker"
                  style={{ width: 34, height: 34, flex: 'none' }}
                  onClick={() => speak(item.example!, { lang: 'en' })}
                  aria-label="朗读例句"
                >
                  <Speaker size={17} />
                </button>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.5 }}>{item.example}</p>
                  {item.example_zh && (
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
                      {item.example_zh}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {item.topic && <span className="badge badge--ghost">#{item.topic}</span>}
            <span className="badge badge--ghost">
              {item.type === 'word' ? '单词' : item.type === 'phrase' ? '短语' : '句子'}
            </span>
            <span className="badge badge--ghost">复习 {item.reps} 次</span>
            {item.lapses > 0 && <span className="badge badge--relearning">答错 {item.lapses} 次</span>}
          </div>
        </div>

        <ForgettingCurve
          curve={curve.curve}
          elapsedDays={elapsedDays}
          retrievability={curve.retrievability}
          markers={markers}
        />

        <div className="split-3" style={{ marginTop: 16 }}>
          <div className="sc">
            <span className="sc-n" style={{ color: 'var(--brand)' }}>
              {curve.stability > 0 ? curve.stability.toFixed(1) : '—'}
            </span>
            <span className="sc-l">记忆稳定度(天)</span>
          </div>
          <div className="sc">
            <span className="sc-n" style={{ color: 'var(--red)' }}>
              {curve.stability > 0 ? `${(curve.retrievability * 100).toFixed(0)}%` : '—'}
            </span>
            <span className="sc-l">{retentionLabel(curve.retrievability)}</span>
          </div>
          <div className="sc">
            <span className="sc-n" style={{ color: 'var(--blue)', fontSize: 15 }}>
              {formatRelativeDue(item.due_at, now)}
            </span>
            <span className="sc-l">下次复习</span>
          </div>
        </div>

        {item.srs_state !== 'new' && (
          <div style={{ marginTop: 14 }}>
            <RetentionMeter value={curve.retrievability} />
          </div>
        )}

        <div className="section-title">
          <h2>手动评分</h2>
          <span>影响下次复习时间</span>
        </div>
        <div className="grades">
          {curve.preview.map((p, idx) => (
            <button key={idx} className={`grade grade--${idx + 1}`} onClick={() => grade((idx + 1) as 1)} disabled={busy}>
              <b>{GRADE_LABEL[idx + 1]}</b>
              <span>
                {p.intervalDays < 1 / 24
                  ? `${Math.max(1, Math.round(p.intervalDays * 1440))} 分钟`
                  : `${Math.max(1, Math.round(p.intervalDays))} 天`}
              </span>
            </button>
          ))}
        </div>

        <div className="section-title">
          <h2>词条信息</h2>
        </div>
        <div className="card">
          <div className="kv">
            <span>添加时间</span>
            <b>{new Date(item.created_at).toLocaleString('zh-CN')}</b>
          </div>
          <div className="kv">
            <span>记忆稳定度 S</span>
            <b>{curve.stability ? curve.stability.toFixed(2) : '未开始'}</b>
          </div>
          <div className="kv">
            <span>难度 D</span>
            <b>{item.difficulty ? item.difficulty.toFixed(2) : '未开始'}</b>
          </div>
          <div className="kv">
            <span>上次复习</span>
            <b>{item.last_review ? new Date(item.last_review).toLocaleString('zh-CN') : '还没复习'}</b>
          </div>
        </div>

        <div className="stepper" style={{ marginTop: 18 }}>
          <button className="btn btn-sm btn-outline" onClick={() => setEditing((v) => !v)}>
            <Pencil size={16} />
            {editing ? '收起编辑' : '编辑'}
          </button>
          <button className="btn btn-sm btn-outline" onClick={reset} disabled={busy}>
            <Refresh size={16} />
            重置为「新词」
          </button>
          <button className="btn btn-sm btn-bad" onClick={remove}>
            <Trash size={16} />
            删除
          </button>
        </div>

        {editing && (
          <EditForm
            item={item}
            onSaved={(next) => {
              setData({ item: next, curve })
              setEditing(false)
              toast.show('已保存')
            }}
          />
        )}

        <div style={{ marginTop: 18 }}>
          <button className="btn btn-block" onClick={() => navigate('/review')}>
            <Sparkle size={20} />
            去复习队列
          </button>
        </div>

        <div className="spacer" style={{ minHeight: 30 }} />
        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="iconbtn" onClick={onClick} aria-label="返回">
      <Back size={20} />
    </button>
  )
}

function EditForm({ item, onSaved }: { item: Item; onSaved: (next: Item) => void }) {
  const [form, setForm] = useState({
    text: item.text,
    translation: item.translation,
    phonetic: item.phonetic ?? '',
    pos: item.pos ?? '',
    example: item.example ?? '',
    example_zh: item.example_zh ?? '',
    topic: item.topic ?? '',
    type: item.type,
  })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const res = await api.updateItem(item.id, {
        text: form.text,
        translation: form.translation,
        phonetic: form.phonetic || null,
        pos: form.pos || null,
        example: form.example || null,
        example_zh: form.example_zh || null,
        topic: form.topic || null,
        type: form.type,
      })
      onSaved(res.item)
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder = '') => (
    <div className="field">
      <label htmlFor={`f-${key}`}>{label}</label>
      <input
        id={`f-${key}`}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  )

  return (
    <div className="card" style={{ marginTop: 14 }}>
      {field('text', '原文')}
      {field('translation', '中文释义')}
      {field('phonetic', '音标', '/ˈæp.əl/')}
      {field('pos', '词性', 'n. / v. / adj.')}
      {field('example', '例句')}
      {field('example_zh', '例句翻译')}
      {field('topic', '主题', '食物 / 旅行')}
      <div className="field">
        <label htmlFor="f-type">类型</label>
        <select
          id="f-type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })}
        >
          <option value="word">单词</option>
          <option value="phrase">短语</option>
          <option value="sentence">句子</option>
        </select>
      </div>
      <button className="btn btn-block" onClick={save} disabled={busy}>
        {busy ? <span className="spinner" /> : '保存'}
      </button>
    </div>
  )
}
