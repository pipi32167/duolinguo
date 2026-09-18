import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'

const GOALS = [
  { name: '轻松', minutes: 5, bar: 22 },
  { name: '标准', minutes: 10, bar: 46 },
  { name: '认真', minutes: 15, bar: 68 },
  { name: '疯狂', minutes: 20, bar: 92 },
]

/** 03 · 每日目标 — 用「轻松→疯狂」四档代替自由输入，降低决策成本 */
export function OnboardingGoal() {
  const navigate = useNavigate()
  const { saveProfile, refreshStats } = useApp()
  const [minutes, setMinutes] = useState(10)

  const finish = async () => {
    saveProfile({ dailyGoalMin: minutes, onboarded: true })
    // best-effort: persist the choice on the server too
    api.updateMe({ daily_goal_min: minutes }).catch(() => undefined)
    refreshStats()
    navigate('/learn', { replace: true })
  }

  return (
    <AppShell variant="immersive">
      <div className="page page--narrow" style={{ paddingTop: 28, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <h1 className="h2">每天想学多久？</h1>
        <p className="lede">选一个你真的能坚持的目标，比选一个大的更有用。</p>

        <div style={{ marginTop: 26 }} role="radiogroup" aria-label="每日目标">
          {GOALS.map((goal) => (
            <button
              key={goal.minutes}
              role="radio"
              aria-checked={minutes === goal.minutes}
              className={`goal${minutes === goal.minutes ? ' is-on' : ''}`}
              onClick={() => setMinutes(goal.minutes)}
            >
              <div className="g-top">
                <span className="g-n">{goal.name}</span>
                <span className="g-t">{goal.minutes} 分钟 / 天</span>
              </div>
              <div className="g-bar">
                <i style={{ width: `${goal.bar}%` }} />
              </div>
            </button>
          ))}
        </div>

        <div className="alert alert--info" style={{ marginTop: 18 }}>
          <span className="dot dot--ok" style={{ marginTop: 6 }} />
          <div>
            <b>这套课程会用「遗忘曲线」安排复习</b>
            每张卡在你快忘掉的时候（记忆保持率降到 90%）才出现，所以 {minutes} 分钟差不多刚好。
          </div>
        </div>

        <div className="spacer" style={{ minHeight: 24 }} />

        <div style={{ paddingBottom: 30 }}>
          <button className="btn btn-block" onClick={finish}>
            继续
          </button>
        </div>
      </div>
    </AppShell>
  )
}
