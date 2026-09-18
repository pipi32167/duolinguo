/** Browser speech helpers. No API key required — this is the free TTS path. */

let cachedVoices: SpeechSynthesisVoice[] = []

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const voices = speechSynthesis.getVoices()
  if (voices.length) cachedVoices = voices
  return cachedVoices
}

if (typeof speechSynthesis !== 'undefined') {
  loadVoices()
  speechSynthesis.addEventListener('voiceschanged', loadVoices)
}

export function speechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined'
}

const LANG_TAG: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  ja: 'ja-JP',
  fr: 'fr-FR',
  de: 'de-DE',
  ko: 'ko-KR',
  zh: 'zh-CN',
}

export interface SpeakOptions {
  lang?: string
  rate?: number
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!speechSupported() || !text.trim()) return Promise.resolve()
  const tag = LANG_TAG[opts.lang ?? 'en'] ?? 'en-US'
  const voices = loadVoices()
  const voice =
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === tag.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(tag.slice(0, 2)))

  return new Promise((resolve) => {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = tag
    u.rate = opts.rate ?? 0.92
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking(): void {
  if (speechSupported()) speechSynthesis.cancel()
}

/* ------------------------------------------------------------------ STT */

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function sttSupported(): boolean {
  return Boolean(recognitionCtor())
}

export interface ListenHandle {
  stop: () => void
}

export function listen(
  opts: { lang?: string; onResult: (text: string) => void; onError?: (message: string) => void },
): ListenHandle | undefined {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    opts.onError?.('当前浏览器不支持语音识别，请直接输入文字')
    return undefined
  }
  const rec = new Ctor()
  rec.lang = LANG_TAG[opts.lang ?? 'en'] ?? 'en-US'
  rec.interimResults = false
  rec.maxAlternatives = 1
  rec.continuous = false
  rec.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript ?? ''
    if (transcript) opts.onResult(transcript)
  }
  rec.onerror = (event) => opts.onError?.(`语音识别失败：${event.error}`)
  try {
    rec.start()
  } catch {
    opts.onError?.('无法启动语音识别')
    return undefined
  }
  return { stop: () => rec.stop() }
}
