import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TopBar } from '../components/TopBar'
import { ErrorBox, Loading } from '../components/State'
import { Back, Refresh, Sparkle } from '../components/Icons'
import { api } from '../lib/api'
import { useToast } from '../lib/hooks'
import { useApp } from '../app/AppContext'

interface TestResult {
  ok: boolean
  error?: string
  baseUrlHost?: string
  endpoint?: string
  text: { ok: boolean; error?: string; ms: number; model?: string }
  vision: { ok: boolean; error?: string; ms: number; model?: string }
  note?: string
}

/**
 * 后端 AI 配置。
 * baseurl / apikey / model 存在 server/.env，也可以在
 * 这个页面里覆盖（写入 settings 表，即时生效，无需重启）。
 */
export function Admin() {
  const navigate = useNavigate()
  const toast = useToast()
  const { ai, reloadAi, aiError } = useApp()

  const [token, setToken] = useState(() => sessionStorage.getItem('lingo.adminToken') ?? '')
  const [form, setForm] = useState({
    baseUrl: '',
    apiKey: '',
    model: '',
    visionModel: '',
    timeoutMs: 90_000,
    temperature: 0.7,
    mock: false,
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult>()
  const [error, setError] = useState<string>()

  /* Hydrate from the admin endpoint (needs the token when one is configured). */
  const load = async (withToken = token) => {
    setError(undefined)
    if (withToken) sessionStorage.setItem('lingo.adminToken', withToken)
    try {
      const cfg = await api.aiAdminConfig()
      setForm({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.hasApiKey ? '••••••••' : '',
        model: cfg.model,
        visionModel: cfg.visionModel === cfg.model ? '' : cfg.visionModel,
        timeoutMs: cfg.timeoutMs,
        temperature: cfg.temperature,
        mock: cfg.mock,
      })
      setLoaded(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const cfg = await api.saveAiConfig({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        visionModel: form.visionModel,
        timeoutMs: form.timeoutMs,
        temperature: form.temperature,
        mock: form.mock,
      })
      setForm((f) => ({ ...f, apiKey: cfg.hasApiKey ? '••••••••' : '' }))
      toast.show('已保存，立即生效')
      reloadAi()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setResult(undefined)
    setError(undefined)
    try {
      setResult(await api.testAi())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const reset = async () => {
    try {
      await api.resetAiConfig()
      toast.show('已恢复为 .env 的值')
      await load()
      reloadAi()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <AppShell onCapture={() => navigate('/capture')}>
      <div className="page page--narrow">
        <TopBar
          left={
            <button className="iconbtn" onClick={() => navigate('/learn')} aria-label="返回">
              <Back size={20} />
            </button>
          }
        />

        <h1 className="h2">AI 配置</h1>
        <p className="lede">
          识别图片与生成课程都走这里的配置。Key 只保存在后端，浏览器永远拿不到它。
        </p>

        {(error || aiError) && <ErrorBox message={error ?? aiError ?? ''} onRetry={() => load()} />}

        {/* current state at a glance */}
        {ai && (
          <div className="card" style={{ marginTop: 18 }}>
            <div className="kv">
              <span>状态</span>
              <b style={{ color: ai.mock ? 'var(--gold-d)' : ai.configured ? 'var(--brand-d)' : 'var(--red)' }}>
                {ai.mock ? 'MOCK 模式（不调用真实模型）' : ai.configured ? '已配置' : '未配置'}
              </b>
            </div>
            <div className="kv">
              <span>baseurl</span>
              <b>{ai.baseUrlHost || '（空）'}</b>
            </div>
            <div className="kv">
              <span>文本模型</span>
              <b>{ai.model || '（空）'}</b>
            </div>
            <div className="kv" style={{ borderBottom: 'none' }}>
              <span>视觉模型</span>
              <b style={{ color: ai.visionReady ? undefined : 'var(--gold-d)' }}>
                {ai.visionModel || '（空）'}
                {!ai.visionReady && ' · 与文本模型相同'}
              </b>
            </div>
          </div>
        )}

        {!loaded && !error && <Loading label="正在读取后端配置…" rows={2} />}

        {loaded && (
          <>
            <div className="section-title">
              <h2>连接参数</h2>
              <span>写入 settings 表，覆盖 .env</span>
            </div>

            <div className="card">
              <div className="field">
                <label htmlFor="baseUrl">Base URL</label>
                <input
                  id="baseUrl"
                  value={form.baseUrl}
                  placeholder="https://api.deepseek.com"
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
                <small>OpenAI 兼容接口。带不带 /v1 都可以，会自动补全为 /v1/chat/completions。</small>
              </div>

              <div className="field">
                <label htmlFor="apiKey">API Key</label>
                <input
                  id="apiKey"
                  type="password"
                  value={form.apiKey}
                  placeholder="sk-…"
                  autoComplete="off"
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
                <small>留空表示不修改；保持 •••••••• 不变也会沿用已保存的 Key。</small>
              </div>

              <div className="field">
                <label htmlFor="model">文本模型（课程生成 / 导师对话）</label>
                <input
                  id="model"
                  value={form.model}
                  placeholder="deepseek-flash"
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="visionModel">视觉模型（图片识别）</label>
                <input
                  id="visionModel"
                  value={form.visionModel}
                  placeholder="deepseek-v4-flash-vision-exp"
                  onChange={(e) => setForm({ ...form, visionModel: e.target.value })}
                />
                <small>
                  必须是支持图片输入的模型。留空则回退到文本模型 —— 但纯文本模型收到图片会返回 400。
                </small>
              </div>

              <div className="field">
                <label htmlFor="timeout">超时（毫秒）</label>
                <input
                  id="timeout"
                  type="number"
                  min={1000}
                  max={600000}
                  step={1000}
                  value={form.timeoutMs}
                  onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })}
                />
              </div>

              <div className="field">
                <label htmlFor="temp">temperature · {form.temperature.toFixed(1)}</label>
                <input
                  id="temp"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                />
                <small>0 更稳定（解析图片用），1 以上更有创意（生成课程用）。</small>
              </div>

              <div className="field">
                <label htmlFor="mock">Mock 模式</label>
                <select
                  id="mock"
                  value={form.mock ? '1' : '0'}
                  onChange={(e) => setForm({ ...form, mock: e.target.value === '1' })}
                >
                  <option value="0">关闭 —— 调用真实模型</option>
                  <option value="1">开启 —— 用内置假数据（无需 Key）</option>
                </select>
              </div>

              <button className="btn btn-block" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : '保存配置'}
              </button>
              <button className="btn-ghost" onClick={reset}>
                恢复为 .env 的值
              </button>
            </div>

            <div className="section-title">
              <h2>连通性自检</h2>
              <span>分别打文本模型与视觉模型</span>
            </div>

            <div className="stepper">
              <button className="btn btn-sm btn-blue" onClick={test} disabled={testing}>
                {testing ? <span className="spinner" /> : <Sparkle size={16} />}
                测试连接
              </button>
              <button className="btn btn-sm btn-outline" onClick={() => load()}>
                <Refresh size={16} />
                重新读取
              </button>
            </div>

            {result && (
              <div className={`alert alert--${result.ok ? 'ok' : 'error'}`} style={{ marginTop: 14 }}>
                <span className={`dot dot--${result.ok ? 'ok' : 'bad'}`} style={{ marginTop: 6 }} />
                <div style={{ flex: 1 }}>
                  <b>{result.ok ? '连接正常' : '有模型不可用'}</b>
                  {result.note && <div>{result.note}</div>}
                  <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.8 }}>
                    <div>
                      文本模型 <b>{result.text.model}</b> ·{' '}
                      <span className={`dot dot--${result.text.ok ? 'ok' : 'bad'}`} style={{ display: 'inline-block' }} />{' '}
                      {result.text.ok ? `${result.text.ms}ms` : result.text.error}
                    </div>
                    <div>
                      视觉模型 <b>{result.vision.model ?? '—'}</b> ·{' '}
                      <span className={`dot dot--${result.vision.ok ? 'ok' : 'bad'}`} style={{ display: 'inline-block' }} />{' '}
                      {result.vision.ok ? `${result.vision.ms}ms` : result.vision.error}
                    </div>
                    {result.endpoint && <div style={{ color: 'var(--muted)' }}>{result.endpoint}</div>}
                  </div>
                </div>
              </div>
            )}

            <div className="section-title">
              <h2>访问令牌</h2>
              <span>仅当 server/.env 里设置了 ADMIN_TOKEN</span>
            </div>

            <div className="card">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="token">Admin Token</label>
                <input
                  id="token"
                  type="password"
                  value={token}
                  placeholder="留空表示后端未设置令牌"
                  autoComplete="off"
                  onChange={(e) => setToken(e.target.value)}
                />
                <small>保存在 sessionStorage，只用于访问这个页面。</small>
              </div>
              <button className="btn btn-sm btn-outline" style={{ marginTop: 12 }} onClick={() => load(token)}>
                用这个令牌读取
              </button>
            </div>

            <div className="alert alert--info" style={{ marginTop: 20 }}>
              <Sparkle size={20} />
              <div>
                <b>也可以直接改 server/.env</b>
                <code style={{ display: 'block', marginTop: 6, fontSize: 11.5, lineHeight: 1.7, fontFamily: 'ui-monospace, monospace' }}>
                  AI_BASE_URL=… · AI_API_KEY=… · AI_MODEL=… · AI_VISION_MODEL=… · AI_MOCK=0
                </code>
                改完重启 dev server 即可；这个页面里的修改优先级更高，重启也不会丢。
              </div>
            </div>
          </>
        )}

        <div className="spacer" style={{ minHeight: 30 }} />
        {toast.message && <span className="toast is-on">{toast.message}</span>}
      </div>
    </AppShell>
  )
}
