import { Leaf, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { t } from '../i18n/strings'

export default function RegisterPage() {
  const { requestRegisterEmail, completeRegisterEmail } = useAuth()
  const { lang, setLang } = useLang()
  const nav = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [niche, setNiche] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [debugCode, setDebugCode] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSendEmail(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (password !== passwordConfirm) {
      setErr(lang === 'ru' ? 'Пароли не совпадают' : 'Passwords do not match')
      return
    }
    setBusy(true)
    try {
      const out = await requestRegisterEmail({
        email: email.trim(),
        password,
        password_confirm: passwordConfirm,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        niche: niche.trim(),
        phone: phone.trim() || undefined,
      })
      setDebugCode(out.debug_code ?? null)
      setStep(2)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await completeRegisterEmail(email.trim(), code.trim())
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
            'radial-gradient(circle at 18% 25%, rgba(16, 185, 129, 0.12) 0%, transparent 45%), radial-gradient(circle at 88% 12%, rgba(5, 150, 105, 0.1) 0%, transparent 40%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
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
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">{t(lang, 'register')}</h1>
          <p className="mt-2 text-sm text-stone-600">
            {step === 1 ? t(lang, 'registerEmailStep1') : t(lang, 'registerEmailStep2')}
          </p>
          <div className="fx-hud-line mt-4" />

          {step === 1 ? (
            <form onSubmit={onSendEmail} className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700">
                    {t(lang, 'firstName')}
                  </label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="fx-input"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-stone-700">
                    {t(lang, 'lastName')}
                  </label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className="fx-input"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">
                  {t(lang, 'nicheField')} ({t(lang, 'optionalShort')})
                </label>
                <input
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder={lang === 'ru' ? 'Напр. молочное скотоводство' : 'e.g. dairy'}
                  className="fx-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">
                  {t(lang, 'email')}
                </label>
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
                <label className="mb-1.5 block text-sm font-medium text-stone-700">
                  {t(lang, 'phone')} ({t(lang, 'optionalShort')})
                </label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={lang === 'ru' ? '+998 …' : '+1 …'}
                  className="fx-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">
                  {t(lang, 'password')}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="fx-input"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">
                  {t(lang, 'passwordConfirm')}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
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
                  t(lang, 'submitSendEmailCode')
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="mt-8 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">
                  {t(lang, 'emailCode')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="fx-input text-lg tracking-widest"
                  required
                  minLength={4}
                  maxLength={8}
                  placeholder="000000"
                />
              </div>
              <p className="text-sm text-stone-600">{t(lang, 'emailCodeHint10m')}</p>
              {debugCode ? (
                <p className="rounded-xl border border-amber-400/35 bg-amber-950/40 px-3 py-2 text-sm font-mono text-amber-100">
                  {t(lang, 'emailDebugCodeLabel')}: {debugCode}
                </p>
              ) : null}
              {err ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1)
                    setCode('')
                    setErr(null)
                  }}
                  className="fx-btn-ghost flex-1 py-3.5"
                >
                  {t(lang, 'back')}
                </button>
                <button type="submit" disabled={busy} className="fx-btn-primary flex-1">
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      {t(lang, 'loading')}
                    </>
                  ) : (
                    t(lang, 'submitVerifySms')
                  )}
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-stone-600">
            {t(lang, 'hasAccount')}{' '}
            <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-600 hover:underline">
              {t(lang, 'login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
