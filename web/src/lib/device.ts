const DEVICE_KEY = 'lingo.device'
const PROFILE_KEY = 'lingo.profile'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Stable anonymous device id — the whole "account" in this build. */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = uuid()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export interface LocalProfile {
  onboarded: boolean
  lang: string
  langLabel: string
  dailyGoalMin: number
}

const DEFAULT_PROFILE: LocalProfile = {
  onboarded: false,
  lang: 'en',
  langLabel: '英语',
  dailyGoalMin: 10,
}

export function readProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { ...DEFAULT_PROFILE }
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<LocalProfile>) }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

export function writeProfile(patch: Partial<LocalProfile>): LocalProfile {
  const next = { ...readProfile(), ...patch }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
  return next
}

export function resetProfile(): void {
  localStorage.removeItem(PROFILE_KEY)
}
