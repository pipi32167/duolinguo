import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Close, Gem, Heart, Shield, Sparkle, Star } from '../components/Icons'
import { useToast } from '../lib/hooks'
import { useApp } from '../app/AppContext'

const FEATURES = [
  { color: 'var(--red)', Icon: Heart, title: '无限心', text: '答错不用等 8 小时，随时接着练' },
  { color: 'var(--blue)', Icon: Shield, title: '无广告', text: '课程之间不再插入推广页' },
  { color: 'var(--purple)', Icon: Sparkle, title: '无限跳级', text: '已掌握的内容直接跳过' },
  { color: 'var(--gold)', Icon: Star, title: '无限错题练习', text: '针对遗忘曲线里最脆弱的词反复练' },
]

const PLANS = [
  { id: 'month', label: '月度', price: '¥68', unit: '/ 月', save: '' },
  { id: 'year', label: '年度', price: '¥468', unit: '/ 年', save: '省 42%' },
  { id: 'family', label: '家庭', price: '¥888', unit: '/ 年 · 最多 6 人', save: '' },
]

/** 11 · 升级 Super — 卖的是「不用等」，不是「更多功能」 */
export function Super() {
  const navigate = useNavigate()
  const toast = useToast()
  const { stats } = useApp()
  const [plan, setPlan] = useState('year')
  const current = PLANS.find((p) => p.id === plan)!

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page page--narrow">
        <button className="iconbtn iconbtn--plain" style={{ marginTop: 14 }} onClick={() => navigate(-1)} aria-label="关闭">
          <Close size={20} />
        </button>

        <div className="super-hero">
          <span className="super-badge">SUPER</span>
          <h2>学得更快，没有等待</h2>
          <p>无限心 · 无广告 · 无限跳级</p>
        </div>

        <div className="feats">
          {FEATURES.map(({ color, Icon, title, text }) => (
            <div className="feat" key={title}>
              <span className="f-ic" style={{ ['--c' as string]: color }}>
                <Icon size={20} />
              </span>
              <div className="feat-text">
                <b>{title}</b>
                <span>{text}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="plans" role="radiogroup" aria-label="订阅方案">
          {PLANS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={plan === p.id}
              className={`plan${plan === p.id ? ' is-on' : ''}`}
              onClick={() => setPlan(p.id)}
            >
              {p.label} <b>{p.price}</b> {p.unit}
              {p.save && <span className="save">{p.save}</span>}
            </button>
          ))}
        </div>

        <button
          className="btn btn-purple btn-block"
          onClick={() => toast.show('这是原型构建：支付流程未接入')}
        >
          免费试用 14 天
        </button>
        <p className="fineprint">
          试用结束后自动续费 {current.price} {current.unit}，可随时在账户中取消。
        </p>

        <div className="card" style={{ marginTop: 22 }}>
          <div className="kv">
            <span>当前会员</span>
            <b>免费会员</b>
          </div>
          <div className="kv">
            <span>宝石</span>
            <b>
              <Gem size={14} /> {stats?.gems ?? 0}
            </b>
          </div>
          <div className="kv">
            <span>心</span>
            <b>
              {stats?.hearts ?? 0} / {stats?.heartsMax ?? 5}
            </b>
          </div>
        </div>

        <div className="spacer" style={{ minHeight: 30 }} />
        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}
