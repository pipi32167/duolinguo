import { Link, NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useTicker } from '../lib/hooks'
import { formatClock } from '../lib/format'
import {
  Brain,
  Camera,
  Clock,
  Deck,
  Flame,
  Gem,
  Heart,
  LingoMark,
  NavLearn,
  NavMe,
  NavQuest,
  NavRank,
  NavShop,
  Settings,
} from './Icons'

interface TabDef {
  to: string
  label: string
  Icon: (p: { className?: string }) => ReactNode
  /** shown in the bottom bar (mobile) — the rail always shows everything */
  primary?: boolean
}

/**
 * Bottom bar keeps the prototype's five-slot rhythm but swaps two decorative
 * tabs (商店 / 任务) for this build's core loop (词库 / 复习). The desktop rail
 * has room for all seven, so nothing becomes unreachable.
 */
export const TABS: TabDef[] = [
  { to: '/learn', label: '学习', Icon: NavLearn, primary: true },
  { to: '/deck', label: '词库', Icon: Deck, primary: true },
  { to: '/review', label: '复习', Icon: Brain, primary: true },
  { to: '/rank', label: '排行', Icon: NavRank, primary: true },
  { to: '/me', label: '我的', Icon: NavMe, primary: true },
  { to: '/shop', label: '商店', Icon: NavShop },
  { to: '/quests', label: '任务', Icon: NavQuest },
]

/** The live "today" cluster at the rail bottom — desktop only. */
function RailStats({ onCapture }: { onCapture?: () => void }) {
  const { stats, user } = useApp()
  useTicker(60_000)
  const tutorLeft = stats?.tutorRemainingSeconds

  return (
    <div className="rail-foot" aria-label="今日状态">
      {user && (
        <div className="rail-user" title="今日学习数据">
          <span className="rail-av">{user.avatar_char}</span>
          <div className="rail-user-meta" style={{ minWidth: 0 }}>
            <b>{user.nickname}</b>
            <span>{user.lang_label} · 第 {Math.max(1, Math.round((Date.now() - user.created_at) / 86_400_000))} 天</span>
          </div>
        </div>
      )}

      <div className="rail-counter">
        <Link to="/learn" className="rail-stat" title="连续天数">
          <Flame size={14} />
          {stats?.streak ?? 0}
        </Link>
        <Link to="/shop" className="rail-stat" title="宝石">
          <Gem size={13} />
          {stats?.gems ?? 0}
        </Link>
        <Link to="/shop" className="rail-stat" title="心">
          <Heart size={13} />
          {stats?.hearts ?? 0}/{stats?.heartsMax ?? 5}
        </Link>
      </div>

      {typeof tutorLeft === 'number' && (
        <Link to="/tutor" className="rail-tutor" title="AI 口语导师">
          <Clock size={13} />
          <span>
            导师还剩 <b>{formatClock(tutorLeft)}</b>
          </span>
        </Link>
      )}

      {onCapture && (
        <button className="rail-item rail-item--quiet" onClick={onCapture}>
          <Camera />
          拍照加词
        </button>
      )}

      <NavLink to="/admin" className="rail-item rail-item--quiet">
        <Settings />
        AI 配置
      </NavLink>
    </div>
  )
}

export function AppShell({
  children,
  variant = 'tabs',
  onCapture,
}: {
  children: ReactNode
  variant?: 'tabs' | 'immersive'
  onCapture?: () => void
}) {
  const { pathname } = useLocation()

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  return (
    <div className="app">
      <div className="app-body">
        <aside className="rail" aria-label="主导航">
          <div className="rail-brand">
            <span className="brandmark brandmark--sm">
              <LingoMark size={26} />
            </span>
            <b>Lingo</b>
          </div>

          {TABS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={`rail-item${isActive(to) ? ' is-on' : ''}`}>
              <Icon />
              {label}
            </NavLink>
          ))}

          <RailStats onCapture={onCapture} />
        </aside>

        <main className="app-main">{children}</main>
      </div>

      {variant === 'tabs' && (
        <nav className="tabbar" aria-label="主导航">
          {TABS.filter((t) => t.primary).map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={isActive(to) ? 'is-on' : ''} style={{ color: undefined }}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
