import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { EmptyState, ErrorBox, InfoBanner } from '../components/State'
import { Album, Camera, Check, Sparkle, Trash } from '../components/Icons'
import { ApiError, api } from '../lib/api'
import { humanBytes, prepareImage, type PreparedImage } from '../lib/image'
import { useToast } from '../lib/hooks'
import type { Item, ItemType } from '../lib/types'

const MAX_FILES = 3

interface Shot {
  id: string
  prepared: PreparedImage
  name: string
}

type Phase = 'idle' | 'scanning' | 'done' | 'error'

/** 拍照 / 相册 → AI 识别词条 → 生成课程 */
export function Capture() {
  const navigate = useNavigate()
  const { ai, profile, reloadAi } = useApp()
  const toast = useToast()

  const [shots, setShots] = useState<Shot[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>()
  const [notes, setNotes] = useState<string>()
  const [items, setItems] = useState<Item[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, MAX_FILES - shots.length)
      if (!list.length) {
        toast.show(`最多一次处理 ${MAX_FILES} 张图片`)
        return
      }
      setError(undefined)
      const prepared: Shot[] = []
      for (const file of list) {
        if (!file.type.startsWith('image/')) {
          setError('只能识别图片文件（JPG / PNG / WebP / HEIC）')
          continue
        }
        try {
          const p = await prepareImage(file)
          prepared.push({ id: crypto.randomUUID(), prepared: p, name: file.name || '照片' })
        } catch (err) {
          setError((err as Error).message)
        }
      }
      if (prepared.length) {
        setShots((prev) => [...prev, ...prepared])
        setPhase('idle')
        setItems([])
      }
    },
    [shots.length, toast],
  )

  const runRecognition = async () => {
    if (!shots.length) return
    setPhase('scanning')
    setError(undefined)
    setNotes(undefined)
    setProgress({ done: 0, total: shots.length })

    const collected: Item[] = []
    let allNotes: string[] = []
    let insertedTotal = 0
    let updatedTotal = 0

    try {
      for (let i = 0; i < shots.length; i++) {
        const res = await api.extractImage(shots[i].prepared.blob, focus)
        collected.push(...res.items)
        insertedTotal += res.inserted
        updatedTotal += res.updated
        if (res.notes) allNotes.push(res.notes)
        setProgress({ done: i + 1, total: shots.length })
      }

      // de-duplicate across images (the server dedupes per image)
      const seen = new Set<string>()
      const merged = collected.filter((it) => {
        if (seen.has(it.norm)) return false
        seen.add(it.norm)
        return true
      })

      if (!merged.length) {
        setPhase('error')
        setError('没有在图片里识别到可学习的词条，换一张光线更好、主体更清晰的照片试试')
        return
      }

      setItems(merged)
      setPicked(new Set(merged.slice(0, 12).map((i) => i.id)))
      setNotes(
        [
          insertedTotal + updatedTotal > 0
            ? `新增 ${insertedTotal} 个，更新 ${updatedTotal} 个（已自动去重）`
            : undefined,
          ...allNotes,
        ]
          .filter(Boolean)
          .join(' · '),
      )
      setPhase('done')
      toast.show(`识别到 ${merged.length} 个词条`)
    } catch (err) {
      setPhase('error')
      setError(err instanceof ApiError ? err.message : '识别失败，请稍后重试')
      if (err instanceof ApiError && err.status === 401) reloadAi()
    }
  }

  const generate = async () => {
    if (!picked.size) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await api.generateLesson({ itemIds: Array.from(picked) })
      toast.show(`课程已生成：${res.exercises.length} 题`)
      navigate(`/lesson/${res.lesson.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成课程失败')
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  const removeItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setPicked((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    api.deleteItems([id]).catch(() => undefined)
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const scanning = phase === 'scanning'

  return (
    <AppShell onCapture={() => cameraRef.current?.click()}>
      <div className="page">
        <TopBar
          left={
            <button className="iconbtn" onClick={() => navigate('/learn')} aria-label="返回学习页">
              ←
            </button>
          }
        />

        <h1 className="h2">拍照加词</h1>
        <p className="lede">
          拍课本、菜单、路牌、板书都行 —— AI 会把里面的{profile.langLabel}单词和短语提取出来，再生成一节课。
        </p>

        {!ai?.configured && !ai?.mock && (
          <div style={{ marginTop: 16 }}>
            <InfoBanner
              tone="warn"
              title="AI 未配置"
              action={
                <button className="btn btn-sm btn-gold" onClick={() => navigate('/admin')}>
                  去配置
                </button>
              }
            >
              识别图片需要 baseurl / apikey，以及一个支持图片输入的视觉模型。
            </InfoBanner>
          </div>
        )}

        {ai?.configured && !ai.visionReady && (
          <div style={{ marginTop: 16 }}>
            <InfoBanner tone="info" title="视觉模型与文本模型相同">
              当前用 <b>{ai.visionModel}</b> 识别图片。如果它不支持图片输入会报 400，请在 AI 配置里单独指定视觉模型。
            </InfoBanner>
          </div>
        )}

        <div className={`capture-grid${items.length || shots.length ? ' has-result' : ''}`} style={{ marginTop: 20 }}>
          {/* ---------- left: input ---------- */}
          <div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={albumRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />

            {shots.length === 0 ? (
              <div
                className={`dropzone${over ? ' is-over' : ''}`}
                onClick={() => albumRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(false)
                  addFiles(e.dataTransfer.files)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') albumRef.current?.click()
                }}
              >
                <span className="dz-ic">
                  <Camera size={30} />
                </span>
                <b>拍一张，或把图片拖进来</b>
                <span className="dz-hint">
                  支持课本 / 菜单 / 路牌 / 板书 / 截图
                  <br />
                  最多一次 {MAX_FILES} 张，会自动压缩后再上传
                </span>
                <div className="stepper" style={{ justifyContent: 'center' }}>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      cameraRef.current?.click()
                    }}
                  >
                    <Camera size={18} />
                    拍照
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      albumRef.current?.click()
                    }}
                  >
                    <Album size={18} />
                    相册
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {shots.map((shot) => (
                  <div className="shot" key={shot.id} style={{ marginBottom: 12 }}>
                    <img src={shot.prepared.dataUrl} alt={shot.name} />
                    {scanning && <span className="scanline" />}
                    <div className="shot-meta">
                      <span>
                        {shot.prepared.width}×{shot.prepared.height}
                      </span>
                      <span>·</span>
                      <span>
                        {humanBytes(shot.prepared.originalBytes)} → {humanBytes(shot.prepared.bytes)}
                      </span>
                      <button
                        className="iconbtn iconbtn--plain"
                        style={{ width: 28, height: 28, marginLeft: 'auto' }}
                        onClick={() => {
                          setShots((prev) => prev.filter((s) => s.id !== shot.id))
                          setItems([])
                          setPhase('idle')
                        }}
                        aria-label="移除这张图片"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {shots.length < MAX_FILES && (
                  <div className="shot-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => cameraRef.current?.click()}>
                      <Camera size={18} />
                      再拍一张
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => albumRef.current?.click()}>
                      <Album size={18} />
                      从相册添加
                    </button>
                  </div>
                )}

                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor="focus">额外要求（可选）</label>
                  <input
                    id="focus"
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    placeholder="例如：只要名词 / 只提取餐厅相关词汇 / 跳过人名"
                    disabled={scanning}
                  />
                </div>

                <button className="btn btn-block" onClick={runRecognition} disabled={scanning || !shots.length}>
                  {scanning ? (
                    <>
                      <span className="spinner" />
                      正在识别 {progress.done}/{progress.total}…
                    </>
                  ) : (
                    <>
                      <Sparkle size={20} />
                      识别 {shots.length} 张图片
                    </>
                  )}
                </button>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
                  使用视觉模型 <b>{ai?.visionModel || '（未配置）'}</b>
                </p>
              </div>
            )}
          </div>

          {/* ---------- right: results ---------- */}
          <div>
            {error && <ErrorBox message={error} onRetry={shots.length ? runRecognition : undefined} />}

            {scanning && (
              <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="spinner spinner--dark" />
                <div>
                  <b style={{ fontSize: 14.5, fontWeight: 900, display: 'block' }}>AI 正在读图…</b>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                    提取词条 → 去重 → 补全音标 / 词性 / 例句
                  </span>
                </div>
              </div>
            )}

            {phase === 'done' && items.length > 0 && (
              <>
                <div className="alert alert--ok" style={{ alignItems: 'center' }}>
                  <Check size={20} />
                  <div style={{ flex: 1 }}>
                    <b>识别到 {items.length} 个词条</b>
                    {notes}
                  </div>
                </div>

                <div className="section-title" style={{ marginTop: 6 }}>
                  <h2>确认要学的词</h2>
                  <span>已选 {picked.size} / {items.length}</span>
                </div>

                <div className="toolbar">
                  <button className="btn btn-sm btn-outline" onClick={() => setPicked(new Set(items.map((i) => i.id)))}>
                    全选
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => setPicked(new Set())}>
                    清空
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setPicked(new Set(items.filter((i) => i.srs_state === 'new').map((i) => i.id)))}
                  >
                    只要新词
                  </button>
                </div>

                <div className="itemlist">
                  {items.map((item) => (
                    <div key={item.id} className={`itemrow${picked.has(item.id) ? ' is-picked' : ''}`}>
                      <button
                        className="ir-main"
                        onClick={() => toggle(item.id)}
                        style={{ textAlign: 'left', background: 'none' }}
                      >
                        <span className="ir-t">
                          {item.text}
                          {item.phonetic && <span className="ir-phon">{item.phonetic}</span>}
                        </span>
                        <span className="ir-s">
                          {item.translation}
                          {item.pos ? ` · ${item.pos}` : ''}
                          {item.srs_state !== 'new' ? ' · 已在词库' : ''}
                        </span>
                      </button>
                      <span className={`badge badge--${item.type === 'word' ? 'new' : 'ghost'}`}>
                        {TYPE_LABEL[item.type as ItemType]}
                      </span>
                      <button
                        className="iconbtn iconbtn--plain"
                        style={{ width: 30, height: 30 }}
                        onClick={() => removeItem(item.id)}
                        aria-label={`删除 ${item.text}`}
                      >
                        <Trash size={16} />
                      </button>
                      <button
                        className="ir-check"
                        style={picked.has(item.id) ? { background: 'var(--brand)', borderColor: 'var(--brand)' } : undefined}
                        onClick={() => toggle(item.id)}
                        aria-label={picked.has(item.id) ? `取消选择 ${item.text}` : `选择 ${item.text}`}
                        aria-pressed={picked.has(item.id)}
                      >
                        {picked.has(item.id) ? '✓' : ''}
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20, position: 'sticky', bottom: 88 }}>
                  <button className="btn btn-block" onClick={generate} disabled={busy || picked.size === 0}>
                    {busy ? (
                      <>
                        <span className="spinner" />
                        正在生成课程…
                      </>
                    ) : (
                      <>
                        <Sparkle size={20} />
                        用这 {picked.size} 个词生成课程
                      </>
                    )}
                  </button>
                  <button className="btn-ghost" onClick={() => navigate('/deck')}>
                    先去词库看看
                  </button>
                </div>
              </>
            )}

            {phase !== 'done' && !scanning && shots.length > 0 && !error && (
              <EmptyState
                icon={<Sparkle size={26} />}
                title="还没开始识别"
                hint="点上面的「识别」按钮，AI 会把图片里的词汇提取成可学习的词条。"
              />
            )}
          </div>
        </div>

        <div className="spacer" style={{ minHeight: 28 }} />
        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}

const TYPE_LABEL: Record<ItemType, string> = {
  word: '单词',
  phrase: '短语',
  sentence: '句子',
}
