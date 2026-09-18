import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { AppShell } from '../components/AppShell'
import { ErrorBox, InfoBanner, Loading } from '../components/State'
import { Close, Heart, Mic, Speaker } from '../components/Icons'
import { ApiError, api } from '../lib/api'
import { useAsync, useToast } from '../lib/hooks'
import { speak, sttSupported, listen, stopSpeaking } from '../lib/speech'
import { canCheck, chipKey, chipText, emptyDraft, evaluate, normalize, type Draft } from '../lib/answer'
import type { Exercise } from '../lib/types'

type Phase = 'answering' | 'correct' | 'wrong' | 'hearts-empty'

/** 05–08 · 课程循环：选择 / 听音 / 填空 / 组句 / 配对 / 自由输入 */
export function Lesson() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshStats } = useApp()

  const lesson = useAsync(() => api.lesson(id), [id])

  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [phase, setPhase] = useState<Phase>('answering')
  const [hearts, setHearts] = useState<number | undefined>()
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const startedAt = useRef(Date.now())
  const [completing, setCompleting] = useState(false)

  const exercises: Exercise[] = lesson.data?.exercises ?? []
  const current = exercises[index]
  const total = exercises.length

  useEffect(() => {
    api.home().then((h) => setHearts(h.stats.hearts)).catch(() => undefined)
  }, [])

  /* auto-play audio for listening exercises */
  useEffect(() => {
    if (current?.prompt.kind === 'listen_choice' && current.prompt.audioText) {
      speak(current.prompt.audioText)
    }
    return () => stopSpeaking()
  }, [current])

  const finish = useCallback(
    async (accuracy: number, finalCombo: number) => {
      setCompleting(true)
      try {
        const xp = Math.max(10, Math.round(exercises.length * 1.5 + accuracy * 5))
        await api.completeLesson(id, {
          xp,
          accuracy,
          durationMs: Date.now() - startedAt.current,
          bestCombo: finalCombo,
        })
        refreshStats()
        navigate(`/lesson/${id}/complete?xp=${xp}&acc=${accuracy.toFixed(2)}&ms=${Date.now() - startedAt.current}`, {
          replace: true,
        })
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : '提交失败')
        setCompleting(false)
      }
    },
    [exercises.length, id, navigate, refreshStats, toast],
  )

  const check = async () => {
    if (!current || busy) return
    setBusy(true)
    const ok = evaluate(current, draft)
    stopSpeaking()

    if (ok) {
      const nextCombo = combo + 1
      setCombo(nextCombo)
      setBestCombo((b) => Math.max(b, nextCombo))
      setPhase('correct')
    } else {
      setCombo(0)
      setWrongCount((w) => w + 1)
      // a wrong answer costs one heart, exactly like the prototype's 08 screen
      try {
        const spent = await api.spendHeart()
        setHearts(spent.stats.hearts)
        refreshStats()
        if (spent.stats.hearts <= 0) {
          setPhase('hearts-empty')
          setBusy(false)
          return
        }
      } catch {
        /* offline: keep the flow moving */
      }
      setPhase('wrong')
    }
    setBusy(false)
  }

  const next = () => {
    if (index + 1 >= total) {
      const correct = total - wrongCount
      void finish(total ? correct / total : 1, bestCombo)
      return
    }
    setIndex((i) => i + 1)
    setDraft(emptyDraft())
    setPhase('answering')
  }

  /* heart refill countdown for the 10 屏 modal */
  useEffect(() => {
    if (phase !== 'hearts-empty') return
    setSecondsLeft(8 * 3600)
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(t)
  }, [phase])

  if (lesson.loading && !lesson.data) {
    return (
      <AppShell variant="immersive">
        <div className="page page--narrow">
          <Loading label="正在准备课程…" rows={2} />
        </div>
      </AppShell>
    )
  }

  if (lesson.error || !current) {
    return (
      <AppShell variant="immersive">
        <div className="page page--narrow">
          <ErrorBox message={lesson.error ?? '课程内容为空'} onRetry={lesson.reload} />
          <button className="btn btn-block btn-outline" onClick={() => navigate('/learn')}>
            回到学习页
          </button>
        </div>
      </AppShell>
    )
  }

  const progress = (index / total) * 100

  return (
    <AppShell variant="immersive">
      <div className="page page--narrow page--player">
        <div className="lessonbar">
          <button className="xbtn" onClick={() => navigate('/learn')} aria-label="退出课程">
            <Close size={20} />
          </button>
          <div className="lprog">
            <i style={{ width: `${progress}%` }} />
          </div>
          <span className="hearts">
            <Heart size={16} />
            {hearts ?? '–'}
          </span>
        </div>

        <div className="lessonbody">
          {lesson.data?.intro && index === 0 && phase === 'answering' && (
            <InfoBanner tone="info" title={lesson.data.lesson.title}>
              {lesson.data.intro}
            </InfoBanner>
          )}

          <p className="q-kicker">
            {current.prompt.kicker}
            {combo >= 3 && <span style={{ color: 'var(--gold-d)', marginLeft: 8 }}>连续答对 {combo} 题</span>}
          </p>

          <ExerciseView
            exercise={current}
            draft={draft}
            setDraft={setDraft}
            locked={phase !== 'answering'}
            onToast={toast.show}
          />
        </div>

        {phase === 'answering' && (
          <div className="lessonfoot">
            <button className="btn btn-block" onClick={check} disabled={!canCheck(current, draft) || busy}>
              {busy ? <span className="spinner" /> : '检查'}
            </button>
          </div>
        )}

        {phase === 'correct' && (
          <div className="result ok">
            <div className="res-top">
              <span className="res-ico">✓</span>
              <span>
                <span className="res-t">{praise(combo)}</span>
                {current.answer.explanation && <span className="res-a">{current.answer.explanation}</span>}
                {!current.answer.explanation && current.answer.translation && (
                  <span className="res-a">{current.answer.translation}</span>
                )}
              </span>
            </div>
            <button className="btn btn-ok btn-block" onClick={next} disabled={completing}>
              {completing ? <span className="spinner" /> : '继续'}
            </button>
          </div>
        )}

        {phase === 'wrong' && (
          <div className="result bad">
            <div className="res-top">
              <span className="res-ico">✕</span>
              <span>
                <span className="res-t">正确答案</span>
                <span className="res-a">{current.answer.value}</span>
                {current.answer.explanation && <span className="res-a">{current.answer.explanation}</span>}
              </span>
            </div>
            <button className="btn btn-bad btn-block" onClick={next} disabled={completing}>
              {completing ? <span className="spinner" /> : '继续'}
            </button>
          </div>
        )}

        {phase === 'hearts-empty' && (
          <>
            <div className="scrim" />
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hearts-title">
              <div className="m-ico">
                <Heart size={34} />
              </div>
              <h3 className="m-t" id="hearts-title">
                心用完了
              </h3>
              <p className="m-s">
                免费会员每 8 小时恢复 1 颗心。
                <br />
                下一颗心将在 <b>{countdown(secondsLeft)}</b> 后恢复。
              </p>
              <button
                className="btn btn-gold btn-block"
                onClick={async () => {
                  try {
                    const res = await api.refillHearts()
                    setHearts(res.stats.hearts)
                    refreshStats()
                    setPhase('wrong')
                  } catch (err) {
                    toast.show(err instanceof ApiError ? err.message : '宝石不足')
                  }
                }}
              >
                用 50 宝石补满
              </button>
              <button className="btn btn-purple btn-block" onClick={() => navigate('/super')}>
                升级解锁无限心
              </button>
              <button className="btn-ghost" onClick={() => navigate('/learn')}>
                等一会儿再来
              </button>
            </div>
          </>
        )}

        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}

function countdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

const PRAISE = ['太棒了！', '漂亮！', '完全正确！', '这就是语感！', '稳如老手！', '再下一城！']
const praise = (combo: number) => PRAISE[Math.min(combo, PRAISE.length - 1)]

/* ============================================================
   Exercise renderers
   ============================================================ */

interface ViewProps {
  exercise: Exercise
  draft: Draft
  setDraft: (d: Draft) => void
  locked: boolean
  onToast: (message: string) => void
}

function ExerciseView({ exercise, draft, setDraft, locked, onToast }: ViewProps) {
  const { prompt } = exercise

  switch (prompt.kind) {
    case 'translate_choice':
    case 'fill_blank':
      return (
        <>
          <h2 className="q-title">{prompt.source}</h2>
          <div className="opts" data-locked={locked}>
            {(prompt.choices ?? []).map((choice) => {
              const picked = draft.choice === choice
              const isAnswer = normalize(choice) === normalize(exercise.answer.value)
              const state = locked
                ? isAnswer
                  ? ' is-right'
                  : picked
                    ? ' is-wrong'
                    : ''
                : picked
                  ? ' is-on'
                  : ''
              return (
                <button
                  key={choice}
                  className={`opt${state}`}
                  disabled={locked}
                  onClick={() => setDraft({ ...draft, choice })}
                >
                  {choice}
                </button>
              )
            })}
          </div>
        </>
      )

    case 'listen_choice':
      return (
        <>
          <div className="src-tip">
            <button className="speaker" onClick={() => speak(prompt.audioText ?? prompt.source)} aria-label="重播">
              <Speaker size={20} />
            </button>
            <span className="src">点击喇叭重播，选出你听到的词</span>
          </div>
          <div className="opts" style={{ marginTop: 22 }}>
            {(prompt.choices ?? []).map((choice) => {
              const picked = draft.choice === choice
              const isAnswer = normalize(choice) === normalize(exercise.answer.value)
              const state = locked ? (isAnswer ? ' is-right' : picked ? ' is-wrong' : '') : picked ? ' is-on' : ''
              return (
                <button
                  key={choice}
                  className={`opt${state}`}
                  disabled={locked}
                  onClick={() => setDraft({ ...draft, choice })}
                >
                  {choice}
                </button>
              )
            })}
          </div>
        </>
      )

    case 'wordbank':
      return <Wordbank exercise={exercise} draft={draft} setDraft={setDraft} locked={locked} />

    case 'match_pairs':
      return <MatchPairs exercise={exercise} draft={draft} setDraft={setDraft} locked={locked} />

    case 'translate_input':
      return (
        <>
          <h2 className="q-title">{prompt.source}</h2>
          <div className="src-tip">
            <button className="speaker" onClick={() => speak(exercise.answer.value)} aria-label="试听">
              <Speaker size={20} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>用{''}目标语言写出这句话</span>
          </div>
          <div style={{ marginTop: 22 }}>
            <textarea
              className="search"
              style={{ width: '100%', height: 108, padding: '14px 16px', lineHeight: 1.5, resize: 'none' }}
              value={draft.text}
              disabled={locked}
              placeholder="在这里输入…"
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            {sttSupported() && (
              <button
                className="btn btn-sm btn-outline"
                style={{ marginTop: 10 }}
                disabled={locked}
                onClick={() => listen({ onResult: (text) => setDraft({ ...draft, text }), onError: onToast })}
              >
                <Mic size={16} />
                用说的
              </button>
            )}
          </div>
        </>
      )

    default:
      return (
        <>
          <h2 className="q-title">{prompt.source}</h2>
          <div className="opts">
            {(prompt.choices ?? []).map((choice) => (
              <button
                key={choice}
                className={`opt${draft.choice === choice ? ' is-on' : ''}`}
                disabled={locked}
                onClick={() => setDraft({ ...draft, choice })}
              >
                {choice}
              </button>
            ))}
          </div>
        </>
      )
  }
}

function Wordbank({
  exercise,
  draft,
  setDraft,
  locked,
}: {
  exercise: Exercise
  draft: Draft
  setDraft: (d: Draft) => void
  locked: boolean
}) {
  const { prompt } = exercise
  const bank = prompt.bank ?? []
  const used = draft.tokens

  /* chips are tracked by index so duplicate words (e.g. two "the") work */
  const usedIndices = new Set(used.map((t) => Number(t.split('§')[1])))

  const move = (token: string, idx: number, toAnswer: boolean) => {
    const key = chipKey(token, idx)
    if (toAnswer) {
      setDraft({ ...draft, tokens: [...used, key] })
    } else {
      setDraft({ ...draft, tokens: used.filter((t) => t !== key) })
    }
  }

  const answered = used.map(chipText)
  const wrong = locked && !evaluate(exercise, draft)

  return (
    <>
      <div className="src-tip">
        <button className="speaker" onClick={() => speak(exercise.answer.value)} aria-label="试听">
          <Speaker size={20} />
        </button>
        <span className="src">{prompt.source}</span>
      </div>

      <div className="wb-ans" style={wrong ? { borderBottomColor: 'var(--red-line)' } : undefined}>
        {used.map((key, i) => (
          <button
            key={`${key}-${i}`}
            className="chip"
            disabled={locked}
            onClick={() => move(chipText(key), Number(key.split('§').pop()), false)}
          >
            {chipText(key)}
          </button>
        ))}
      </div>

      <div className="wb-pool">
        {bank.map((token, i) => (
          <button
            key={`${token}-${i}`}
            className="chip"
            style={usedIndices.has(i) ? { visibility: 'hidden' } : undefined}
            disabled={locked}
            onClick={() => move(token, i, true)}
          >
            {token}
          </button>
        ))}
      </div>

      {locked && (
        <p style={{ fontSize: 13, fontWeight: 800, color: wrong ? 'var(--red-ink)' : 'var(--brand-deep)' }}>
          你的答案：{answered.join(' ')}
        </p>
      )}
    </>
  )
}

function MatchPairs({
  exercise,
  draft,
  setDraft,
  locked,
}: {
  exercise: Exercise
  draft: Draft
  setDraft: (d: Draft) => void
  locked: boolean
}) {
  const pairs = exercise.prompt.pairs ?? []
  const right = useMemo(
    () => [...pairs.map((p) => p.right)].sort((a, b) => a.localeCompare(b, 'zh')),
    [pairs],
  )
  const [left, setLeft] = useState<string>()
  const [wrongPair, setWrongPair] = useState<string>()

  const matches = draft.matches
  const matchedLeft = (value: string) => Object.keys(matches).includes(value)
  const matchedRight = (value: string) => Object.values(matches).includes(value)

  useEffect(() => {
    setLeft(undefined)
    setWrongPair(undefined)
  }, [exercise.id])

  const pick = (side: 'left' | 'right', value: string) => {
    if (locked || matchedLeft(value) || matchedRight(value)) return
    if (side === 'left') {
      setLeft(value)
      return
    }
    if (!left) return
    const expected = pairs.find((p) => p.left === left)?.right
    if (normalize(expected ?? '') === normalize(value)) {
      setDraft({ ...draft, matches: { ...matches, [left]: value } })
      setLeft(undefined)
    } else {
      setWrongPair(value)
      window.setTimeout(() => setWrongPair(undefined), 600)
    }
  }

  return (
    <>
      <h2 className="q-title" style={{ fontSize: 22 }}>
        把词和释义配对
      </h2>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginTop: 10 }}>
        先点左边的词，再点右边对应的释义。全配对完后点「检查」。
      </p>
      <div className="split-2" style={{ marginTop: 18, gap: 10 }}>
        <div className="itemlist">
          {pairs.map((p) => (
            <button
              key={p.left}
              className={`chip${left === p.left ? ' is-picked' : ''}`}
              style={{
                width: '100%',
                padding: '16px 14px',
                opacity: matchedLeft(p.left) ? 0.35 : 1,
                borderColor: left === p.left ? 'var(--blue)' : undefined,
                background: left === p.left ? 'var(--blue-t)' : undefined,
              }}
              disabled={locked || matchedLeft(p.left)}
              onClick={() => pick('left', p.left)}
            >
              {p.left}
            </button>
          ))}
        </div>
        <div className="itemlist">
          {right.map((r) => (
            <button
              key={r}
              className="chip"
              style={{
                width: '100%',
                padding: '16px 14px',
                background: wrongPair === r ? 'var(--red-t)' : undefined,
                borderColor: wrongPair === r ? 'var(--red)' : undefined,
                opacity: matchedRight(r) ? 0.35 : 1,
              }}
              disabled={locked || matchedRight(r)}
              onClick={() => pick('right', r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginTop: 16 }}>
        已配对 {Object.keys(matches).length} / {pairs.length}
      </p>
    </>
  )
}

