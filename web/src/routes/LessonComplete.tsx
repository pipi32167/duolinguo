import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { AppShell } from '../components/AppShell'
import { Check, Flame, Sparkle } from '../components/Icons'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useApp } from '../app/AppContext'
import { formatElapsed } from '../lib/format'

/** 09 · 课程完成 — 经验 / 准确率 / 用时三张卡，外加强化连续天数 */
export function LessonComplete() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshStats } = useApp()

  const me = useAsync(() => api.me(), [])
  const lesson = useAsync(() => api.lesson(id), [id])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  const xp = Number(params.get('xp') ?? lesson.data?.lesson.xp ?? 15)
  const accuracy = Number(params.get('acc') ?? lesson.data?.lesson.accuracy ?? 0.9)
  const ms = Number(params.get('ms') ?? lesson.data?.lesson.durationMs ?? 0)
  const streak = me.data?.stats.streak ?? 0

  return (
    <AppShell variant="immersive">
      <div
        className="page page--narrow"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minHeight: '100dvh', paddingTop: 40 }}
      >
        <div className="burst">
          <Check size={52} />
        </div>

        <h1 className="h2" style={{ fontSize: 30 }}>
          课程完成！
        </h1>
        <p className="lede">
          {lesson.data?.lesson.unitLabel ?? '第一单元'} · {lesson.data?.lesson.title ?? '自定义课程'}
        </p>

        <div className="statcards">
          <div className="sc">
            <span className="sc-n" style={{ color: 'var(--gold-d)' }}>
              +{xp}
            </span>
            <span className="sc-l">经验值</span>
          </div>
          <div className="sc">
            <span className="sc-n" style={{ color: 'var(--blue-d)' }}>
              {Math.round(accuracy * 100)}%
            </span>
            <span className="sc-l">准确率</span>
          </div>
          <div className="sc">
            <span className="sc-n" style={{ color: 'var(--purple-d)' }}>
              {formatElapsed(ms)}
            </span>
            <span className="sc-l">用时</span>
          </div>
        </div>

        <div className="streakcard">
          <Flame size={22} />
          连续学习 {streak} 天
          <span>比昨天更进一步</span>
        </div>

        {/* SRS payoff: what this lesson did to the schedule */}
        <div className="card" style={{ textAlign: 'left', marginTop: 16, width: '100%' }}>
          <b style={{ fontSize: 13.5, fontWeight: 900, display: 'block', marginBottom: 10 }}>
            遗忘曲线已更新
          </b>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', lineHeight: 1.65 }}>
            这节课里的每个词都记录了记忆稳定度。答对的词会隔更久再出现，答错的词 10 分钟后就会回来找你。
          </p>
          <div className="stepper" style={{ marginTop: 12 }}>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/deck')}>
              看看词库
            </button>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/review')}>
              继续复习
            </button>
          </div>
        </div>

        <div className="spacer" style={{ minHeight: 24 }} />

        <div style={{ width: '100%', paddingBottom: 30 }}>
          <button className="btn btn-block" onClick={() => navigate('/learn')}>
            <Sparkle size={20} />
            继续
          </button>
        </div>
      </div>
    </AppShell>
  )
}
