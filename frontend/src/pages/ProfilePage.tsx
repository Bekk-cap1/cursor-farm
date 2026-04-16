import { ArrowLeft, BarChart3, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { LoadingBlock } from '../components/LoadingBlock'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'
import { readRobotDisabled, writeRobotDisabled } from '../lib/robotSettings'
import { t } from '../i18n/strings'

export default function ProfilePage() {
  const { lang } = useLang()
  const { me } = useAuth()
  const [robotDisabled, setRobotDisabled] = useState(readRobotDisabled)
  const [dash, setDash] = useState<api.DashboardSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await api.fetchDashboardSummary()
        if (!cancelled) setDash(d)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const sync = () => setRobotDisabled(readRobotDisabled())
    window.addEventListener('farm-robot-setting-changed', sync)
    return () => window.removeEventListener('farm-robot-setting-changed', sync)
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <RouterLink
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === 'ru' ? 'На дашборд' : 'Back to dashboard'}
        </RouterLink>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">{t(lang, 'profilePageTitle')}</h1>
        <p className="text-stone-600">
          {me?.first_name || me?.last_name
            ? `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || me?.email
            : me?.email}
        </p>
        {me?.niche ? <p className="text-sm text-stone-500">{me.niche}</p> : null}
      </div>

      {err ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p>
      ) : null}

      <section className="fx-panel rounded-2xl p-6">
        <h2 className="text-lg font-bold text-stone-900">{t(lang, 'profileSettingsTitle')}</h2>
        <p className="mt-1 text-sm text-stone-600">{t(lang, 'profileRobotHint')}</p>
        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500/40"
            checked={!robotDisabled}
            onChange={(e) => {
              const hide = !e.target.checked
              writeRobotDisabled(hide)
              setRobotDisabled(hide)
            }}
          />
          <span className="text-sm font-medium text-stone-800">{t(lang, 'profileRobotToggle')}</span>
        </label>
      </section>

      <section className="fx-panel rounded-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          {t(lang, 'profileSecurityTitle')}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t(lang, 'profileSecurityPlaceholder')}</p>
      </section>

      <section className="fx-panel rounded-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
          <BarChart3 className="h-5 w-5 text-emerald-600" />
          {t(lang, 'profileStatsTitle')}
        </h2>
        {loading && !err ? (
          <LoadingBlock lang={lang} compact className="mt-4" />
        ) : dash ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 shadow-sm">
              <p className="fx-eyebrow">{t(lang, 'kpiFarms')}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{dash.farms_count}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 shadow-sm">
              <p className="fx-eyebrow">{t(lang, 'fieldsShort')}</p>
              <p className="mt-1 text-2xl font-bold text-stone-900">{dash.zones_total}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 shadow-sm">
              <p className="fx-eyebrow text-amber-800/90">{t(lang, 'cropsShort')}</p>
              <p className="mt-1 text-2xl font-bold text-amber-900">{dash.zones_total}</p>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 shadow-sm">
              <p className="fx-eyebrow text-teal-800/90">{t(lang, 'animalsShort')}</p>
              <p className="mt-1 text-2xl font-bold text-teal-900">{dash.herds_total}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
