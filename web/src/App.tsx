import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useApp } from './app/AppContext'
import { Welcome } from './routes/Welcome'
import { OnboardingLanguage } from './routes/OnboardingLanguage'
import { OnboardingGoal } from './routes/OnboardingGoal'
import { Learn } from './routes/Learn'
import { DeckRoute } from './routes/Deck'
import { ItemDetail } from './routes/ItemDetail'
import { ReviewRoute } from './routes/Review'
import { Rank } from './routes/Rank'
import { Shop } from './routes/Shop'
import { Quests } from './routes/Quests'
import { Me } from './routes/Me'
import { Capture } from './routes/Capture'
import { Lesson } from './routes/Lesson'
import { LessonComplete } from './routes/LessonComplete'
import { Super } from './routes/Super'
import { Tutor } from './routes/Tutor'
import { Admin } from './routes/Admin'
import { NotFound } from './routes/NotFound'

export function App() {
  const { profile } = useApp()
  const location = useLocation()
  const navigate = useNavigate()

  /** First run goes through onboarding; deep links are respected. */
  useEffect(() => {
    if (!profile.onboarded && !location.pathname.startsWith('/onboarding') && location.pathname !== '/') {
      navigate('/onboarding/language', { replace: true })
    }
  }, [profile.onboarded, location.pathname, navigate])

  return (
    <Routes>
      <Route path="/" element={profile.onboarded ? <Navigate to="/learn" replace /> : <Welcome />} />
      <Route path="/onboarding/language" element={<OnboardingLanguage />} />
      <Route path="/onboarding/goal" element={<OnboardingGoal />} />

      <Route path="/learn" element={<Learn />} />
      <Route path="/deck" element={<DeckRoute />} />
      <Route path="/deck/:id" element={<ItemDetail />} />
      <Route path="/review" element={<ReviewRoute />} />
      <Route path="/rank" element={<Rank />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/quests" element={<Quests />} />
      <Route path="/me" element={<Me />} />

      <Route path="/capture" element={<Capture />} />
      <Route path="/lesson/:id" element={<Lesson />} />
      <Route path="/lesson/:id/complete" element={<LessonComplete />} />
      <Route path="/super" element={<Super />} />
      <Route path="/tutor" element={<Tutor />} />
      <Route path="/admin" element={<Admin />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
