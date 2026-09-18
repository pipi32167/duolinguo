import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { Flame, Gem, Heart } from './Icons'
import { useTicker } from '../lib/hooks'
import { formatCooldown } from '../lib/format'

/**
 * 顶部状态条。
 *
 * - 手机：语言 chip 在左，连续天数/宝石/心 在右
 * - 平板：中间补一个今日目标进度，填掉两侧之间的空档
 * - 桌面：侧边栏已经承载了那三个计数，这里就不再重复，
 *   改成「语言 chip + 今日目标」左对齐，避免 800px+ 的空档
 */
export function TopBar({ left }: { left?: React.ReactNode }) {
  const { stats, profile } = useApp()
  useTicker(60_000) // keep the heart countdown honest

  const refill = stats?.heartRefillSeconds ?? 0
  const goalMin = stats?.dailyGoalMin ?? profile.dailyGoalMin
  const todayMin = Math.round((stats?.todaySeconds ?? 0) / 60)
  const goalPct = Math.min(100, Math.round((todayMin / Math.max(goalMin, 1)) * 100))
  const goalDone = todayMin >= goalMin

  return (
    <div className="topbar">
      {left ?? <span className="langchip">{profile.langLabel} · 第一单元</span>}

      <span className="topbar-meters">
        <span className={`topbar-goal${goalDone ? ' is-done' : ''}`} title={`今日 ${todayMin} / ${goalMin} 分钟`}>
          <span className="topbar-goal-bar">
            <i style={{ width: `${goalPct}%` }} />
          </span>
          <b>
            {todayMin}/{goalMin} 分钟
          </b>
        </span>
        {refill > 0 && <span className="topbar-refill">心 {formatCooldown(refill)}后补</span>}
      </span>

      <div className="stats">
        <span className="stat flame" title="连续天数">
          <Flame size={18} />
          {stats?.streak ?? 0}
        </span>
        <span className="stat gem" title="宝石">
          <Gem size={17} />
          {stats?.gems ?? 0}
        </span>
        <Link
          to="/shop"
          className="stat heart"
          title={refill > 0 ? `${formatCooldown(refill)}后恢复 1 颗心` : "体力"}
          style={{ textDecoration: 'none' }}
        >
          <Heart size={17} />
          {stats?.hearts ?? 0}
        </Link>
      </div>
    </div>
  )
}
