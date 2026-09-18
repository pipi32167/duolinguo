import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, Loading } from '../components/State'
import { Check, Clock, Star } from '../components/Icons'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

const ICONS: Record<string, typeof Clock> = { clock: Clock, check: Check, star: Star }

/** 任务 — 今日任务，进度来自真实学习数据 */
export function Quests() {
  const navigate = useNavigate()
  const quests = useAsync(() => api.quests(), [])

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page page--list">
        <TopBar />

        <div className="questhead" style={{ marginTop: 4 }}>
          <b>今日任务</b>
          <span>每天 0 点刷新</span>
        </div>

        {quests.error && <ErrorBox message={quests.error} onRetry={quests.reload} />}
        {quests.loading && !quests.data && <Loading label="正在读取任务…" rows={3} />}

        {quests.data?.quests.map((q) => {
          const Icon = ICONS[q.icon] ?? Star
          const pctVal = Math.min(100, (q.progress / q.goal) * 100)
          return (
            <div className="quest" key={q.id}>
              <span className="q-ic" style={{ ['--c' as string]: q.color }}>
                <Icon size={20} />
              </span>
              <div className="q-main">
                <b>{q.title}</b>
                <div className="q-bar">
                  <i style={{ width: `${pctVal}%` }} />
                </div>
                <span>
                  {q.done
                    ? '已完成'
                    : `${Math.floor(q.progress)} / ${q.goal} ${q.unit}`}
                </span>
              </div>
              <span className="q-rw" style={q.done ? { color: 'var(--brand-d)' } : undefined}>
                {q.done ? '已领取' : `+${q.reward} 宝石`}
              </span>
            </div>
          )
        })}

        {quests.data && (
          <div className="alert alert--info" style={{ marginTop: 16 }}>
            <Clock size={20} />
            <div>
              <b>任务进度来自真实数据</b>
              学习时长、完成课程数、最长连对都记录在后端，换设备（同一浏览器）也能接着算。
            </div>
          </div>
        )}

        <div className="spacer" style={{ minHeight: 24 }} />
      </div>
    </AppShell>
  )
}
