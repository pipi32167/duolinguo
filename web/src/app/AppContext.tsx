import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { readProfile, writeProfile, type LocalProfile } from '../lib/device'
import type { AiStatus, Stats, User } from '../lib/types'

interface AppState {
  profile: LocalProfile
  saveProfile: (patch: Partial<LocalProfile>) => void
  ai: AiStatus | undefined
  aiError: string | undefined
  reloadAi: () => void
  stats: Stats | undefined
  user: User | undefined
  refreshStats: () => void
  needsSetup: boolean
}

const Ctx = createContext<AppState | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<LocalProfile>(() => readProfile())
  const [ai, setAi] = useState<AiStatus>()
  const [aiError, setAiError] = useState<string>()
  const [stats, setStats] = useState<Stats>()
  const [user, setUser] = useState<User>()

  const saveProfile = useCallback((patch: Partial<LocalProfile>) => {
    setProfileState(writeProfile(patch))
  }, [])

  const loadAi = useCallback(() => {
    api
      .bootstrap()
      .then((res) => {
        setAi(res.ai)
        setAiError(undefined)
      })
      .catch((err: Error) => setAiError(err.message))
  }, [])

  const refreshStats = useCallback(() => {
    api
      .home()
      .then((res) => {
        setStats(res.stats)
        setUser(res.user)
      })
      .catch(() => {
        /* the home screen surfaces its own error */
      })
  }, [])

  useEffect(() => {
    loadAi()
    refreshStats()
  }, [loadAi, refreshStats])

  const value = useMemo<AppState>(
    () => ({
      profile,
      saveProfile,
      ai,
      aiError,
      reloadAi: loadAi,
      stats,
      user,
      refreshStats,
      needsSetup: Boolean(ai) && !ai?.configured && !ai?.mock,
    }),
    [profile, saveProfile, ai, aiError, loadAi, stats, user, refreshStats],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
