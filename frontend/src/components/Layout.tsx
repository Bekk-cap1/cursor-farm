import {
  Activity,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Sparkles,
  Sprout,
  Tractor,
  User,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, matchPath, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import * as api from '../lib/api'
import { t } from '../i18n/strings'
import { readRobotDisabled } from '../lib/robotSettings'
import { NotificationBell } from './NotificationBell'
import { ExtensionBanner } from './ExtensionBanner'

export function Layout() {
  const { me, logout } = useAuth()
  const { lang, setLang } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const farmRouteMatch = matchPath({ path: '/farm/:farmId', end: false }, location.pathname)
  const farmRouteId = farmRouteMatch?.params.farmId
  const farmTabParam = new URLSearchParams(location.search).get('tab') ?? 'overview'
  const [navFarms, setNavFarms] = useState<api.FarmSummary[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [streamsOpen, setStreamsOpen] = useState(false)
  const firstFarmId = navFarms[0]?.id
  const firstFarmRef = useRef(firstFarmId)
  firstFarmRef.current = firstFarmId

  const [robotApi, setRobotApi] = useState<import('../robot-widget').RobotPublicApi | null>(null)
  const [robotDisabled, setRobotDisabled] = useState(() =>
    typeof window !== 'undefined' ? readRobotDisabled() : false,
  )

  useEffect(() => {
    const sync = () => setRobotDisabled(readRobotDisabled())
    window.addEventListener('farm-robot-setting-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('farm-robot-setting-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || robotDisabled) {
      void import('../robot-widget').then((m) => {
        m.destroyRobotWidget()
      })
      setRobotApi(null)
      return () => {}
    }
    let cancelled = false
    void import('../robot-widget').then((m) => {
      if (cancelled) return
      const api = m.initRobotWidget({
        lang,
        onOpenAgent: () => {
          const fromPath = matchPath({ path: '/farm/:farmId', end: false }, window.location.pathname)
            ?.params?.farmId
          const fid =
            fromPath ?? (firstFarmRef.current != null ? String(firstFarmRef.current) : '')
          if (fid) navigate(`/farm/${fid}?tab=agent`)
          else navigate('/')
        },
      })
      setRobotApi(api)
    })
    return () => {
      cancelled = true
      void import('../robot-widget').then((mod) => {
        mod.destroyRobotWidget()
      })
      setRobotApi(null)
    }
  }, [lang, robotDisabled, navigate])

  useEffect(() => {
    const path = `${location.pathname}${location.search}`
    robotApi?.onRouteChange(path)
  }, [location.pathname, location.search, robotApi])

  useEffect(() => {
    let cancelled = false
    async function pull() {
      try {
        const list = await api.fetchFarms()
        if (!cancelled) setNavFarms(list)
      } catch {
        if (!cancelled) setNavFarms([])
      }
    }
    void pull()
    const onRefresh = () => {
      void pull()
    }
    window.addEventListener('farm-nav-refresh', onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('farm-nav-refresh', onRefresh)
    }
  }, [])

  const farmTab = (tab: string) =>
    firstFarmId != null ? `/farm/${firstFarmId}?tab=${tab}` : '/'

  const navClassActive =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 bg-white text-emerald-950 shadow-sm'
  const navClassIdle =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 text-emerald-100/95 hover:bg-white/10 hover:text-white'

  const farmSectionClass = (wantTab: string) =>
    Boolean(farmRouteId) && farmTabParam === wantTab ? navClassActive : navClassIdle

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? navClassActive : navClassIdle

  const aside = (
    <aside className="flex h-full w-full min-h-0 flex-col bg-emerald-950 text-white md:overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-5">
        <NavLink
          to="/"
          onClick={() => setSidebarOpen(false)}
          className="flex min-w-0 items-center gap-3 font-semibold tracking-tight text-white"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-white ring-1 ring-emerald-400/30">
            <Leaf className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="truncate text-lg">{t(lang, 'navSidebarTitle')}</span>
        </NavLink>
        <button
          type="button"
          className="rounded-lg p-2 text-emerald-200 hover:bg-white/10 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="fx-scroll-dark flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <div>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">
            {t(lang, 'navMain')}
          </p>
          <NavLink to="/" end onClick={() => setSidebarOpen(false)} className={navClass}>
            <LayoutDashboard className="h-5 w-5 shrink-0 opacity-95" />
            {t(lang, 'navDashboard')}
          </NavLink>
          <NavLink to="/ai-analytics" onClick={() => setSidebarOpen(false)} className={navClass}>
            <Sparkles className="h-5 w-5 shrink-0 opacity-95" />
            {t(lang, 'navAiAnalytics')}
          </NavLink>
          {firstFarmId != null ? (
            <>
              <NavLink
                to={farmTab('fields')}
                onClick={() => setSidebarOpen(false)}
                className={() => farmSectionClass('fields')}
              >
                <Sprout className="h-5 w-5 shrink-0 opacity-95" />
                {t(lang, 'fields')}
              </NavLink>
              <NavLink
                to={farmTab('herds')}
                onClick={() => setSidebarOpen(false)}
                className={() => farmSectionClass('herds')}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-lg leading-none opacity-95">
                  🐄
                </span>
                {t(lang, 'herds')}
              </NavLink>
              <NavLink
                to={farmTab('tasks')}
                onClick={() => setSidebarOpen(false)}
                className={() => farmSectionClass('tasks')}
              >
                <Activity className="h-5 w-5 shrink-0 opacity-95" />
                {t(lang, 'navActivities')}
              </NavLink>
            </>
          ) : (
            <p className="mt-2 px-3 text-xs leading-snug text-emerald-200/80">{t(lang, 'navNoFarms')}</p>
          )}
          <div className="mt-1">
            <NavLink to="/profile" onClick={() => setSidebarOpen(false)} className={navClass}>
              <User className="h-5 w-5 shrink-0 opacity-95" />
              {t(lang, 'navProfile')}
            </NavLink>
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">
            {t(lang, 'navFarms')}
          </p>
          <div className="space-y-0.5">
            {navFarms.map((f) => (
              <NavLink
                key={f.id}
                to={`/farm/${f.id}?tab=overview`}
                onClick={() => setSidebarOpen(false)}
                className={() =>
                  location.pathname === `/farm/${f.id}`
                    ? 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150 bg-white/20 text-white ring-1 ring-white/30'
                    : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150 text-emerald-100/85 hover:bg-white/10 hover:text-white'
                }
              >
                <Tractor className="h-4 w-4 shrink-0 opacity-90" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              </NavLink>
            ))}
            {!navFarms.length ? (
              <p className="px-3 py-2 text-xs text-emerald-200/60">{t(lang, 'navNoFarms')}</p>
            ) : null}
          </div>
        </div>
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <p className="px-1 text-xs text-emerald-200/80">{t(lang, 'supportPhone')}</p>
        <div className="flex rounded-xl border border-white/10 bg-black/15 p-1">
          <button
            type="button"
            onClick={() => setLang('ru')}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              lang === 'ru' ? 'bg-white/20 text-white' : 'text-emerald-200/80'
            }`}
          >
            RU
          </button>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              lang === 'en' ? 'bg-white/20 text-white' : 'text-emerald-200/80'
            }`}
          >
            EN
          </button>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          {t(lang, 'logout')}
        </button>
      </div>
    </aside>
  )

  const isDashboard = location.pathname === '/'
  const isAiAnalytics = location.pathname === '/ai-analytics'

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-transparent text-stone-800 md:flex-row md:gap-3 md:p-3">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-stone-900/50 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 ease-out md:static md:inset-auto md:z-auto md:h-auto md:w-72 md:flex-shrink-0 md:translate-x-0 md:self-stretch ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-full min-h-0 flex-col md:h-[calc(100dvh-1.5rem)] md:max-h-[calc(100dvh-1.5rem)] md:overflow-hidden md:rounded-3xl md:ring-1 md:ring-stone-300/60 md:shadow-lg">
          {aside}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stone-50 md:rounded-3xl md:border md:border-stone-200/80 md:bg-white md:shadow-md">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200/90 bg-white px-4 py-3 shadow-sm md:hidden">
          <button
            type="button"
            className="rounded-xl border border-stone-200 bg-white p-2 text-stone-700 shadow-sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="min-w-0 flex-1 truncate font-semibold text-emerald-950">
            {isDashboard
              ? t(lang, 'dashboardSystemTitle')
              : isAiAnalytics
                ? t(lang, 'aiAnalyticsPageTitle')
                : t(lang, 'brand')}
          </span>
          <NotificationBell lang={lang} variant="mobile" />
        </header>

        <header className="sticky top-0 z-20 hidden border-b border-stone-200/80 bg-white px-6 py-3.5 shadow-sm md:flex md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">{t(lang, 'brand')}</p>
            <p className="text-sm font-semibold text-stone-800">
              {isDashboard
                ? t(lang, 'dashboardSystemTitle')
                : isAiAnalytics
                  ? t(lang, 'aiAnalyticsPageTitle')
                  : t(lang, 'tagline')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={`rounded-md px-2.5 py-1 ${
                  lang === 'ru' ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-500'
                }`}
              >
                RU
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`rounded-md px-2.5 py-1 ${
                  lang === 'en' ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-500'
                }`}
              >
                EN
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStreamsOpen(true)}
              className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 lg:inline-flex"
            >
              {t(lang, 'streamsBtn')}
            </button>
            <NotificationBell lang={lang} variant="desktop" />
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-1 pr-3 ring-1 ring-emerald-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {(me?.email ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-medium text-stone-700">{me?.email}</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl p-2 text-stone-500 hover:bg-stone-100 hover:text-emerald-800"
              aria-label={t(lang, 'logout')}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="fx-scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-8 md:py-8 [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-[1600px]">
            <Outlet />
            <p className="mx-auto mt-10 max-w-[1600px] pb-4 text-center text-xs text-stone-400">
              {t(lang, 'disclaimer')}
            </p>
          </div>
        </main>
      </div>

      <ExtensionBanner />

      {streamsOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900">{t(lang, 'streamsModalTitle')}</h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{t(lang, 'streamsModalText')}</p>
            <button
              type="button"
              onClick={() => setStreamsOpen(false)}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
