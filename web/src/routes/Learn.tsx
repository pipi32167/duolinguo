import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, InfoBanner, Loading } from '../components/State'
import { Brain, Camera, Check, Deck, Lock, Sparkle, Star } from '../components/Icons'
import { useAsync } from '../lib/hooks'
import { api } from '../lib/api'
import type { PathNode } from '../lib/types'
import { pct } from '../lib/format'

/** 04 · 主页 · 学习路径 — 路径节点由遗忘曲线的到期数驱动，不再是静态假数据 */
export function Learn() {
  const navigate = useNavigate()
  const { profile, needsSetup, stats } = useApp()
  const home = useAsync(() => api.home(), [])
  const deck = useAsync(() => api.deckStats(), [])

  const goalMin = home.data?.user.daily_goal_min ?? profile.dailyGoalMin
  const todayMin = Math.round((home.data?.stats.todaySeconds ?? stats?.todaySeconds ?? 0) / 60)
  const goalPct = Math.min(100, Math.round((todayMin / Math.max(goalMin, 1)) * 100))

  const openNode = (node: PathNode) => {
    if (node.kind === 'capture') return navigate('/capture')
    if (node.kind === 'review') return navigate('/review')
    if (node.lessonId) return navigate(`/lesson/${node.lessonId}`)
    return navigate('/review')
  }

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page">
        <TopBar />

        {needsSetup && (
          <InfoBanner
            tone="warn"
            title="AI 还没配好"
            action={
              <button className="btn btn-sm btn-gold" onClick={() => navigate('/admin')}>
                去配置
              </button>
            }
          >
            识别图片和生成课程都需要 baseurl / apikey / 模型。
          </InfoBanner>
        )}

        {home.error && <ErrorBox message={home.error} onRetry={home.reload} />}

        <div className="unitcard">
          <div style={{ minWidth: 0 }}>
            <span className="u-kicker">
              第一单元 · 你的词库
              {home.data ? ` ${home.data.path.deckTotal} 个词` : ''}
            </span>
            <span className="u-title">
              {home.data && home.data.path.due > 0
                ? `${home.data.path.due} 个词到期复习`
                : todayMin >= goalMin
                  ? '今日目标已完成'
                  : '拍照加词，AI 生成课程'}
            </span>
          </div>
          <span className="u-guide">指南</span>
        </div>

        {/* 今日目标 + 遗忘曲线总览：桌面端并成一行，移动端竖排 */}
        <div className="learn-stats">
          <div className="panel learn-goal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <b style={{ fontSize: 13.5, fontWeight: 900 }}>今日目标</b>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)' }}>
                {todayMin} / {goalMin} 分钟
              </span>
            </div>
            <div className="g-bar" style={{ marginTop: 10 }}>
              <i style={{ width: `${goalPct}%` }} />
            </div>
            <p className="learn-goal-hint">
              {todayMin >= goalMin
                ? '今天的量已经够了 —— 再加一节会加长明天的复习队列。'
                : `再学 ${Math.max(1, goalMin - todayMin)} 分钟就能收工，连续天数不会断。`}
            </p>
          </div>

          {deck.data && deck.data.stats.total > 0 && (
            <div className="split-3 learn-srs">
              <div className="sc">
                <span className="sc-n" style={{ color: 'var(--red)' }}>
                  {deck.data.stats.due}
                </span>
                <span className="sc-l">今日到期</span>
              </div>
              <div className="sc">
                <span className="sc-n" style={{ color: 'var(--brand)' }}>
                  {pct(deck.data.stats.avgRetention)}
                </span>
                <span className="sc-l">平均记住率</span>
              </div>
              <div className="sc">
                <span className="sc-n" style={{ color: 'var(--blue)' }}>
                  {deck.data.stats.mature + deck.data.stats.young}
                </span>
                <span className="sc-l">已进入曲线</span>
              </div>
            </div>
          )}
        </div>

        {home.loading && !home.data && <Loading label="正在读取你的学习路径…" />}

        {home.data && (
          <div className="path">
            {home.data.path.nodes.map((node) => (
              <div className="node-wrap" key={node.key}>
                <button
                  className={`node${node.state === 'locked' ? ' is-locked' : ''}${node.state === 'current' ? ' is-current' : ''}`}
                  onClick={() => openNode(node)}
                  disabled={node.state === 'locked'}
                  aria-label={`${node.label} · ${node.meta}`}
                  title={`${node.label} · ${node.meta}`}
                >
                  {/* Inside the button so it follows the node's --tx stagger offset.
                      aria-hidden because the button's label already carries the text. */}
                  {node.state === 'current' && (
                    <span className="bubble" aria-hidden="true">
                      {node.meta}
                    </span>
                  )}
                  {node.state === 'done' ? (
                    <Check size={28} />
                  ) : node.state === 'locked' ? (
                    <Lock size={24} />
                  ) : node.kind === 'capture' ? (
                    <Camera size={28} />
                  ) : node.kind === 'review' ? (
                    <Brain size={26} />
                  ) : node.kind === 'lesson' ? (
                    <Sparkle size={26} />
                  ) : (
                    <Star size={26} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* primary actions — the path is decorative-ish, these are the real doors */}
        <div className="split-2" style={{ marginTop: 8 }}>
          <button className="btn btn-block" onClick={() => navigate('/capture')}>
            <Camera size={20} />
            拍照加词
          </button>
          <button className="btn btn-block btn-blue" onClick={() => navigate('/review')}>
            <Brain size={20} />
            开始复习
          </button>
        </div>

        <div className="split-2" style={{ marginTop: 12 }}>
          <button className="btn btn-block btn-outline" onClick={() => navigate('/deck')}>
            <Deck size={20} />
            我的词库
          </button>
          <button className="btn btn-block btn-outline" onClick={() => navigate('/quests')}>
            <Star size={20} />
            今日任务
          </button>
        </div>

        <div className="spacer" style={{ minHeight: 20 }} />
      </div>
    </AppShell>
  )
}
