import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, Loading } from '../components/State'
import { Sparkle } from '../components/Icons'
import { api } from '../lib/api'
import { useAsync, useTicker } from '../lib/hooks'
import { useApp } from '../app/AppContext'
import { formatClock, pct } from '../lib/format'
import { LANGUAGES } from './OnboardingLanguage'

/** 我的 — 统计 / 学习设置 / AI 状态 / 后端入口 */
export function Me() {
  const navigate = useNavigate()
  const { profile } = useApp()
  useTicker(30_000)
  const me = useAsync(() => api.me(), [])
  const insights = useAsync(() => api.insights(), [])

  const stats = me.data?.stats

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page">
        <TopBar />

        {me.error && <ErrorBox message={me.error} onRetry={me.reload} />}
        {me.loading && !me.data && <Loading label="正在读取账户…" rows={3} />}

        {me.data && (
          <>
            <div className="mehead">
              <span className="me-av">{me.data.user.avatar_char}</span>
              <div className="me-meta" style={{ minWidth: 0 }}>
                <b>{me.data.user.nickname}</b>
                <span>
                  加入 {Math.max(1, Math.round((Date.now() - me.data.user.created_at) / 86_400_000))} 天 · 正在学
                  {me.data.user.lang_label} · 词库 {me.data.deck.total} 个
                </span>
              </div>
            </div>

            <div className="mestats">
              <div>
                <b>{stats?.streak ?? 0}</b>
                <span>连续天数</span>
              </div>
              <div>
                <b>{(stats?.xp ?? 0).toLocaleString('en-US')}</b>
                <span>总经验</span>
              </div>
              <div>
                <b>{me.data.deck.due}</b>
                <span>今日到期</span>
              </div>
            </div>

            <div className="superpromo">
              <div style={{ minWidth: 0 }}>
                <b>升级 Super</b>
                <span>无限心 · 无广告 · 无限跳级</span>
              </div>
              <button className="promo-btn" onClick={() => navigate('/super')}>
                了解
              </button>
            </div>

            {/* 记忆健康度 + 最近课程：桌面端并排，移动端竖排 */}
            <div className="me-panels">
              {insights.data && insights.data.total > 0 && (
                <section className="me-panel">
                  <div className="section-title" style={{ marginTop: 4 }}>
                    <h2>记忆健康度</h2>
                    <span>共 {insights.data.total} 张卡</span>
                  </div>
                  <div className="card">
                    {insights.data.buckets.map((b) => (
                      <div key={b.label} className="kv">
                        <span>
                          <i className="dot" style={{ background: b.color, display: 'inline-block', marginRight: 8 }} />
                          {b.label}
                        </span>
                        <b>{b.count} 个</b>
                      </div>
                    ))}
                    <div className="kv" style={{ borderBottom: 'none' }}>
                      <span>平均记住率</span>
                      <b>{pct(me.data.deck.avgRetention)}</b>
                    </div>
                  </div>
                </section>
              )}

              {me.data.lessons.length > 0 && (
                <section className="me-panel">
                  <div className="section-title" style={{ marginTop: 4 }}>
                    <h2>最近课程</h2>
                    <span>{me.data.lessons.length} 节</span>
                  </div>
                  <div className="card">
                    {me.data.lessons.slice(0, 5).map((lesson) => (
                      <div className="kv" key={lesson.id}>
                        <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{lesson.title}</span>
                        <b>
                          {lesson.status === 'completed'
                            ? `+${lesson.xp} 经验 · ${Math.round((lesson.accuracy ?? 0) * 100)}%`
                            : lesson.status === 'failed'
                              ? '生成失败'
                              : '待完成'}
                        </b>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="merows">
              <button className="merow" onClick={() => navigate('/onboarding/goal')}>
                <span>每日目标</span>
                <b>{me.data.user.daily_goal_min} 分钟</b>
                <i>›</i>
              </button>
              <button className="merow" onClick={() => navigate('/onboarding/language')}>
                <span>学习语言</span>
                <b>{me.data.user.lang_label}</b>
                <i>›</i>
              </button>
              <button className="merow" onClick={() => navigate('/tutor')}>
                <span>AI 口语导师</span>
                <b>剩余 {formatClock(stats?.tutorRemainingSeconds ?? 0)}</b>
                <i>›</i>
              </button>
              <button className="merow" onClick={() => navigate('/admin')}>
                <span>AI 后端配置</span>
                <b>
                  {me.data.ai.mock ? 'MOCK 模式' : me.data.ai.configured ? me.data.ai.model : '未配置'}
                </b>
                <i>›</i>
              </button>
              <button
                className="merow"
                onClick={() => navigate('/learn')}
              >
                <span>学习语言代码</span>
                <b>{LANGUAGES.find((l) => l.code === (profile.lang || me.data!.user.lang))?.label ?? me.data.user.lang_label}</b>
                <i>›</i>
              </button>
              <div className="merow" style={{ cursor: 'default' }}>
                <span>账户与订阅</span>
                <b>免费会员</b>
                <i>›</i>
              </div>
            </div>

            <div className="alert alert--info" style={{ marginTop: 18 }}>
              <Sparkle size={20} />
              <div>
                <b>关于这个构建</b>
                账户是匿名设备会话（localStorage 里的一个 UUID），没有注册流程。识别图片与生成课程都走你自己的后端 AI
                配置，Key 只存在服务端。
              </div>
            </div>
          </>
        )}

        <div className="spacer" style={{ minHeight: 24 }} />
      </div>
    </AppShell>
  )
}
