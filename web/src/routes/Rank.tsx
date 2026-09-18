import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, Loading } from '../components/State'
import { Trophy } from '../components/Icons'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'

/** 排行 — 黄金联赛榜单，自己那行用绿底高亮 */
export function Rank() {
  const navigate = useNavigate()
  const board = useAsync(() => api.leaderboard(), [])

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page page--list">
        <TopBar />

        <h1 className="h2">排行榜</h1>
        <p className="lede">按本周经验值排名，前 10 名晋级。</p>

        {board.error && <ErrorBox message={board.error} onRetry={board.reload} />}
        {board.loading && !board.data && <Loading label="正在读取榜单…" rows={4} />}

        {board.data && (
          <>
            <div className="rankhead" style={{ marginTop: 20 }}>
              <Trophy size={34} />
              <div>
                <div className="rk-t">{board.data.league}</div>
                <div className="rk-s">3 天后结束 · 前 10 名晋级 · 你目前第 {board.data.myRank} 名</div>
              </div>
            </div>

            <div className="ranklist">
              {board.data.rows.map((row) => (
                <div className={`rkrow${row.me ? ' is-me' : ''}`} key={`${row.rank}-${row.name}`}>
                  <span className="rk-i">{row.rank}</span>
                  <span className="rk-av" style={{ ['--ac' as string]: row.color }}>
                    {row.char}
                  </span>
                  <span className="rk-n">{row.name}</span>
                  <span className="rk-xp">{row.xp.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginTop: 14, lineHeight: 1.6 }}>
              榜单里的其他学习者按固定数据生成，你的位置由真实经验值决定。
            </p>
          </>
        )}

        <div className="spacer" style={{ minHeight: 24 }} />
      </div>
    </AppShell>
  )
}
