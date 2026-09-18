import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { LingoMark } from '../components/Icons'
import { InfoBanner } from '../components/State'

const WORDS = ['Hello', 'Hola', 'こんにちは', 'Bonjour', '안녕', 'Ciao', 'Guten Tag', 'Merhaba']

/** 01 · 欢迎首屏 — 价值主张 + 语言氛围，不放吉祥物 */
export function Welcome() {
  const navigate = useNavigate()
  const { ai, needsSetup } = useApp()

  return (
    <div className="app">
      <main className="app-main">
        <div className="page page--narrow" style={{ paddingTop: 40, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
          <div className="welcome-hero">
            <div>
              <span className="brandmark">
                <LingoMark size={40} />
              </span>
              <h1 className="hero">
                免费、有趣、
                <br />
                真正学得会
              </h1>
              <p className="lede">
                每天 10 分钟，把一门新语言用起来。
                <br />
                不用背单词表，直接开口。
              </p>
            </div>

            <div className="wordcloud" style={{ alignSelf: 'center' }}>
              {WORDS.map((w) => (
                <span className="wc" key={w}>
                  {w}
                </span>
              ))}
            </div>
          </div>

          {needsSetup && (
            <div style={{ marginTop: 22 }}>
              <InfoBanner tone="warn" title="后端还没配置 AI">
                {ai?.baseUrlHost ? `baseurl 已指向 ${ai.baseUrlHost}，` : ''}但缺少 API Key。先去{' '}
                <b>AI 配置</b> 页面填上 baseurl / apikey / 模型，识别和生成课程才能用。
              </InfoBanner>
            </div>
          )}

          <div className="spacer" style={{ minHeight: 28 }} />

          <div style={{ paddingBottom: 40 }}>
            <button className="btn btn-block" onClick={() => navigate('/onboarding/language')}>
              开始
            </button>
            <button className="btn-ghost" onClick={() => navigate('/admin')}>
              AI 配置 · 已有账号？登录
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
