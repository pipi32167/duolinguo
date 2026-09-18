import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, Loading } from '../components/State'
import { Gem, Heart, Shield, Star } from '../components/Icons'
import { api } from '../lib/api'
import { useAsync, useToast } from '../lib/hooks'
import { useApp } from '../app/AppContext'

const ICONS: Record<string, typeof Heart> = { heart: Heart, shield: Shield, gem: Gem, star: Star }

/** 商店 — 宝石 / 心 / 强化三个分类 */
export function Shop() {
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshStats } = useApp()
  const shop = useAsync(() => api.shop(), [])
  const [tab, setTab] = useState('gems')

  const buy = async (id: string, gems: number) => {
    try {
      await api.buy(id, gems)
      toast.show(gems > 0 ? '购买成功' : '支付流程未接入（原型构建）')
      shop.reload()
      refreshStats()
    } catch (err) {
      toast.show((err as Error).message)
    }
  }

  const current = shop.data?.tabs.find((t) => t.id === tab) ?? shop.data?.tabs[0]

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page page--list">
        <TopBar />

        <h1 className="h2">商店</h1>

        {shop.error && <ErrorBox message={shop.error} onRetry={shop.reload} />}
        {shop.loading && !shop.data && <Loading label="正在读取商店…" rows={3} />}

        {shop.data && (
          <>
            <div className="bal" style={{ marginTop: 18 }}>
              <Gem size={22} />
              <b>{shop.data.gems}</b>
              <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.75, marginLeft: 6 }}>
                宝石 · {shop.data.hearts} 颗心
              </span>
            </div>

            <div className="pills" role="tablist">
              {shop.data.tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`pill${tab === t.id ? ' is-on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="shopgrid">
              {current?.packs.map((pack) => (
                <div key={pack.id} className={`shopcard${pack.hot ? ' is-hot' : ''}`}>
                  {pack.hot && <span className="hot">最超值</span>}
                  {tab === 'gems' ? <Gem size={26} /> : tab === 'hearts' ? <Heart size={26} /> : <Star size={26} />}
                  <b>{tab === 'gems' ? pack.amount : `×${pack.amount}`}</b>
                  <button className="price" onClick={() => buy(pack.id, 0)}>
                    {pack.price}
                  </button>
                </div>
              ))}
            </div>

            <div className="section-title">
              <h2>强化道具</h2>
              <span>用宝石购买</span>
            </div>

            {shop.data.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Star
              const affordable = shop.data!.gems >= item.gems
              return (
                <div className="shoprow" key={item.id}>
                  <span className="sr-ic">
                    <Icon size={20} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b className="sr-t">{item.title}</b>
                    <span className="sr-s">{item.subtitle}</span>
                  </div>
                  <button
                    className="btn btn-sm"
                    style={{ marginLeft: 'auto', flex: 'none' }}
                    disabled={!affordable}
                    onClick={() => buy(item.id, item.gems)}
                  >
                    {item.price}
                  </button>
                </div>
              )
            })}

            <p className="fineprint" style={{ marginTop: 18 }}>
              原型构建：宝石包与订阅的支付流程未接入真实支付渠道。
            </p>
          </>
        )}

        <div className="spacer" style={{ minHeight: 24 }} />
        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}
