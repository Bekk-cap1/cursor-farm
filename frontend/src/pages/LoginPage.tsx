import { Leaf, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { t } from '../i18n/strings'

export default function LoginPage() {
  const { login } = useAuth()
  const { lang, setLang } = useLang()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
      nav('/', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fx-page">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.14) 0%, transparent 45%), radial-gradient(circle at 85% 15%, rgba(5, 150, 105, 0.1) 0%, transparent 42%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-stone-900">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-md shadow-emerald-900/10">
              <Leaf className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">{t(lang, 'brand')}</p>
              <p className="text-sm text-stone-600">{t(lang, 'tagline')}</p>
            </div>
          </div>
          <div className="flex rounded-full border border-stone-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                lang === 'ru' ? 'fx-chip-on' : 'fx-chip border-0'
              }`}
            >
              RU
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                lang === 'en' ? 'fx-chip-on' : 'fx-chip border-0'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <div className="fx-card shadow-[0_24px_50px_-20px_rgba(0,0,0,0.12)]">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">{t(lang, 'login')}</h1>
          <p className="mt-1 text-sm text-stone-600">{t(lang, 'tagline')}</p>
          <div className="fx-hud-line mt-4" />

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">{t(lang, 'email')}</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="fx-input"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">{t(lang, 'password')}</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="fx-input"
                required
                minLength={8}
              />
            </div>
            {err ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
            ) : null}
            <button type="submit" disabled={busy} className="fx-btn-primary w-full">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  {t(lang, 'loading')}
                </>
              ) : (
                t(lang, 'submitLogin')
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-stone-500">{t(lang, 'demoHint')}</p>

          <p className="mt-6 text-center text-sm text-stone-600">
            {t(lang, 'noAccount')}{' '}
            <Link to="/register" className="font-semibold text-emerald-700 hover:text-emerald-600 hover:underline">
              {t(lang, 'register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
