import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { AppShell } from '../components/AppShell'

interface LangOption {
  code: string
  label: string
  flag: string
  color: string
  learners: string
}

/** Mirrors the prototype's language list, including the learner counts. */
export const LANGUAGES: LangOption[] = [
  { code: 'en', label: '英语', flag: 'EN', color: '#3B6BD6', learners: '1.24 亿人学习' },
  { code: 'es', label: '西班牙语', flag: 'ES', color: '#E4572E', learners: '4,120 万人学习' },
  { code: 'ja', label: '日语', flag: 'JA', color: '#D6455D', learners: '2,860 万人学习' },
  { code: 'fr', label: '法语', flag: 'FR', color: '#7B4FD1', learners: '2,340 万人学习' },
  { code: 'de', label: '德语', flag: 'DE', color: '#D9A400', learners: '1,580 万人学习' },
  { code: 'ko', label: '韩语', flag: 'KO', color: '#12A594', learners: '1,070 万人学习' },
  { code: 'zh', label: '中文', flag: 'ZH', color: '#C0392B', learners: '9,800 万人学习' },
  { code: 'it', label: '意大利语', flag: 'IT', color: '#008C45', learners: '760 万人学习' },
]

/** 02 · 选择语言 — 选中态用绿描边 + 勾，不做下拉菜单 */
export function OnboardingLanguage() {
  const navigate = useNavigate()
  const { profile, saveProfile } = useApp()
  const [picked, setPicked] = useState(profile.lang)

  const current = LANGUAGES.find((l) => l.code === picked) ?? LANGUAGES[0]

  return (
    <AppShell variant="immersive">
      <div className="page page--narrow" style={{ paddingTop: 28, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <h1 className="h2">你想学哪门语言？</h1>
        <p className="lede">之后随时可以在「我的」里更换</p>

        <div className="lang-list" role="radiogroup" aria-label="选择学习语言">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              role="radio"
              aria-checked={picked === lang.code}
              className={`lang${picked === lang.code ? ' is-on' : ''}`}
              onClick={() => setPicked(lang.code)}
            >
              <span className="flag" style={{ ['--fc' as string]: lang.color }}>
                {lang.flag}
              </span>
              <span className="lname">{lang.label}</span>
              <span className="lmeta">{lang.learners}</span>
              <span className="lcheck" aria-hidden>
                ✓
              </span>
            </button>
          ))}
        </div>

        <div className="spacer" style={{ minHeight: 24 }} />

        <div style={{ paddingBottom: 30 }}>
          <button
            className="btn btn-block"
            onClick={() => {
              saveProfile({ lang: current.code, langLabel: current.label })
              navigate('/onboarding/goal')
            }}
          >
            继续
          </button>
        </div>
      </div>
    </AppShell>
  )
}
