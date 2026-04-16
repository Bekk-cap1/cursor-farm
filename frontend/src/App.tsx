import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import { useLang } from './context/LangContext'
import { t } from './i18n/strings'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const FarmPage = lazy(() => import('./pages/FarmPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const AiAnalyticsPage = lazy(() => import('./pages/AiAnalyticsPage'))

function PageFallback() {
  const { lang } = useLang()
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-stone-600">
      <Loader2 className="h-9 w-9 animate-spin text-emerald-600" aria-hidden />
      <span className="text-sm font-medium">{t(lang, 'loading')}</span>
    </div>
  )
}

function LoginGate() {
  const { me, loading } = useAuth()
  const { lang } = useLang()
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f6f1] text-stone-600">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
        <span className="text-sm font-medium">{t(lang, 'loading')}</span>
      </div>
    )
  }
  if (me) return <Navigate to="/" replace />
  return <LoginPage />
}

function RegisterGate() {
  const { me, loading } = useAuth()
  const { lang } = useLang()
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f6f1] text-stone-600">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
        <span className="text-sm font-medium">{t(lang, 'loading')}</span>
      </div>
    )
  }
  if (me) return <Navigate to="/" replace />
  return <RegisterPage />
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginGate />} />
        <Route path="/register" element={<RegisterGate />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="ai-analytics" element={<AiAnalyticsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="farm/:farmId" element={<FarmPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
