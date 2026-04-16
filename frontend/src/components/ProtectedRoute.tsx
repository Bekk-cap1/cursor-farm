import { Loader2 } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { t } from '../i18n/strings'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  const { lang } = useLang()
  const loc = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f6f1] text-stone-600">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white px-10 py-8 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
          <span className="text-sm font-medium">{t(lang, 'loading')}</span>
        </div>
      </div>
    )
  }

  if (!me) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }

  return <>{children}</>
}
