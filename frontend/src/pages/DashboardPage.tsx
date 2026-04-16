import { ChevronDown, ChevronUp, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AiAnalyticsSection } from '../components/analytics/AiAnalyticsSection'
import { IotPreviewSection } from '../components/analytics/IotPreviewSection'
import { DashboardVegetationStrip } from '../components/DashboardVegetationStrip'
import { LoadingBlock } from '../components/LoadingBlock'
import { Toast } from '../components/Toast'
import { useLang } from '../context/LangContext'
import * as api from '../lib/api'
import { formatFarmDateTime } from '../lib/datetime'
import { t } from '../i18n/strings'
import { buildAnalyticsBreakdownLines } from '../lib/farmAiEngine'
import { computeIotSnapshot } from '../lib/iotMetrics'
import { invalidateOverview, saveOverview, tryReadOverview } from '../lib/pageDataCache'

type DashToast = { message: string; variant: 'error' | 'success' }

export default function DashboardPage() {
  const { lang } = useLang()
  const [summary, setSummary] = useState<api.DashboardSummary | null>(null)
  const [farms, setFarms] = useState<api.FarmSummary[]>([])
  const [notifs, setNotifs] = useState<api.AppNotification[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [iotBusy, setIotBusy] = useState(false)
  const [analytics, setAnalytics] = useState<api.DashboardAnalyze | null>(null)
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<number | null>(null)
  const [toast, setToast] = useState<DashToast | null>(null)
  const [demoAiBusy, setDemoAiBusy] = useState(false)
  const [creatingActivityKey, setCreatingActivityKey] = useState<string | null>(null)
  const [createdActivityKeys, setCreatedActivityKeys] = useState<string[]>([])
  const [showSensorsAndAi, setShowSensorsAndAi] = useState(false)
  const [health, setHealth] = useState<api.HealthResponse | null>(null)
  const [iotCtx, setIotCtx] = useState<{
    weather: Awaited<ReturnType<typeof api.fetchWeather>>
    zones: api.FieldZone[]
    herds: api.HerdGroup[]
    tasks: api.Task[]
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const [dash, farmList, notes] = await Promise.all([
        api.fetchDashboardSummary(),
        api.fetchFarms(),
        api.fetchNotifications(),
      ])
      setSummary(dash)
      setFarms(farmList)
      setNotifs(notes)
      setErr(null)

      const fid = farmList[0]?.id
      let iotCtxNext: {
        weather: Awaited<ReturnType<typeof api.fetchWeather>>
        zones: api.FieldZone[]
        herds: api.HerdGroup[]
        tasks: api.Task[]
      } | null = null
      if (fid != null) {
        try {
          const [w, z, h, tk] = await Promise.all([
            api.fetchWeather(fid),
            api.fetchZones(fid),
            api.fetchHerds(fid),
            api.fetchTasks(fid),
          ])
          iotCtxNext = { weather: w, zones: z, herds: h, tasks: tk }
          setIotCtx(iotCtxNext)
        } catch {
          setIotCtx(null)
        }
      } else {
        setIotCtx(null)
      }

      let analyticsNext: api.DashboardAnalyze | null = null
      let analyzedAt: number | null = null
      try {
        analyticsNext = await api.postDashboardAnalyze(lang)
        analyzedAt = Date.now()
        setAnalytics(analyticsNext)
        setLastAnalyzedAt(analyzedAt)
      } catch {
        setAnalytics(null)
        analyticsNext = null
        analyzedAt = null
      }

      saveOverview(lang, {
        summary: dash,
        farms: farmList,
        analytics: analyticsNext,
        lastAnalyzedAt: analyzedAt,
        iotCtx: iotCtxNext,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [lang])

  const onLoadDemoAi = useCallback(async () => {
    const fid = farms[0]?.id
    if (fid == null) {
      setToast({
        message: lang === 'ru' ? 'Сначала добавьте ферму' : 'Add a farm first',
        variant: 'error',
      })
      return
    }
    setDemoAiBusy(true)
    setToast(null)
    try {
      const res = await api.postDashboardDemoAiData(fid)
      await load()
      try {
        setAnalytics(await api.postDashboardAnalyze(lang))
        setLastAnalyzedAt(Date.now())
        setCreatedActivityKeys([])
        invalidateOverview()
      } catch {
        /* optional */
      }
      setToast({
        message: res.skipped ? t(lang, 'demoAiSkipped') : t(lang, 'demoAiLoaded'),
        variant: 'success',
      })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setDemoAiBusy(false)
    }
  }, [farms, lang, load])

  const runAnalyze = useCallback(async () => {
    setAnalyzeBusy(true)
    setToast(null)
    try {
      setAnalytics(await api.postDashboardAnalyze(lang))
      setLastAnalyzedAt(Date.now())
      setCreatedActivityKeys([])
      invalidateOverview()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setAnalyzeBusy(false)
    }
  }, [lang])

  const onCreateActivity = useCallback(
    async (s: api.ActivitySuggestion) => {
      setCreatingActivityKey(s.key)
      setToast(null)
      try {
        await api.createTask(s.farm_id, {
          title: `[AI] ${s.title}`,
          kind: s.kind,
          description: s.description,
        })
        setCreatedActivityKeys((prev) => [...prev, s.key])
        setToast({ message: t(lang, 'activityCreatedToast'), variant: 'success' })
        window.dispatchEvent(new Event('notifications-refresh'))
        await load()
      } catch (e) {
        setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
      } finally {
        setCreatingActivityKey(null)
      }
    },
    [lang, load],
  )

  const onSyncReadings = useCallback(async () => {
    const fid = farms[0]?.id
    if (fid == null) {
      setToast({
        message: lang === 'ru' ? 'Сначала добавьте ферму' : 'Add a farm first',
        variant: 'error',
      })
      return
    }
    setIotBusy(true)
    setToast(null)
    try {
      await api.syncZoneReadings(fid)
      const [w, z, h, tk] = await Promise.all([
        api.fetchWeather(fid),
        api.fetchZones(fid),
        api.fetchHerds(fid),
        api.fetchTasks(fid),
      ])
      setIotCtx({ weather: w, zones: z, herds: h, tasks: tk })
      setToast({ message: t(lang, 'iotReadingsSyncedToast'), variant: 'success' })
      try {
        setAnalytics(await api.postDashboardAnalyze(lang))
        setLastAnalyzedAt(Date.now())
        invalidateOverview()
      } catch {
        /* optional */
      }
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setIotBusy(false)
    }
  }, [farms, lang])

  const onAddDevice = useCallback(async () => {
    const fid = farms[0]?.id
    if (fid == null) {
      setToast({
        message: lang === 'ru' ? 'Сначала добавьте ферму' : 'Add a farm first',
        variant: 'error',
      })
      return
    }
    setIotBusy(true)
    setToast(null)
    try {
      const label =
        lang === 'ru'
          ? `Поле / датчик ${new Date().toLocaleString()}`
          : `Field / sensor ${new Date().toLocaleString()}`
      await api.createZone(fid, {
        name: label.slice(0, 200),
        irrigation_type: 'drip',
        soil_moisture_0_5: 3,
      })
      const [w, z, h, tk] = await Promise.all([
        api.fetchWeather(fid),
        api.fetchZones(fid),
        api.fetchHerds(fid),
        api.fetchTasks(fid),
      ])
      setIotCtx({ weather: w, zones: z, herds: h, tasks: tk })
      setToast({ message: t(lang, 'zoneAddedToast'), variant: 'success' })
      void load()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setIotBusy(false)
    }
  }, [farms, lang, load])

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    void api.fetchHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    const cached = tryReadOverview(lang)
    if (cached) {
      setSummary(cached.summary)
      setFarms(cached.farms)
      setAnalytics(cached.analytics)
      setLastAnalyzedAt(cached.lastAnalyzedAt)
      setIotCtx(cached.iotCtx)
      setErr(null)
      setLoading(false)
      void (async () => {
        try {
          await api.syncNotifications()
        } catch {
          /* optional */
        }
        try {
          setNotifs(await api.fetchNotifications())
        } catch {
          /* optional */
        }
      })()
      return
    }

    void (async () => {
      try {
        await api.syncNotifications()
      } catch {
        /* optional */
      }
      await loadRef.current()
    })()
  }, [lang])

  async function onSyncNotifs() {
    try {
      await api.syncNotifications()
      setNotifs(await api.fetchNotifications())
      window.dispatchEvent(new Event('notifications-refresh'))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }

  async function onMarkRead(id: number) {
    try {
      await api.markNotificationRead(id)
      setNotifs(await api.fetchNotifications())
      window.dispatchEvent(new Event('notifications-refresh'))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }

  async function addFarm(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createFarm({ name: name.trim(), region: region.trim() })
      setModal(false)
      setName('')
      setRegion('')
      invalidateOverview()
      await load()
      window.dispatchEvent(new Event('farm-nav-refresh'))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const farmNameById = (id: number) => farms.find((f) => f.id === id)?.name ?? `#${id}`

  const iotSnap = useMemo(
    () =>
      computeIotSnapshot(
        iotCtx?.weather ?? null,
        iotCtx?.zones ?? [],
        iotCtx?.herds ?? [],
        iotCtx?.tasks ?? [],
      ),
    [iotCtx],
  )

  const indicesBreakdownLines = useMemo(() => {
    if (!summary) return undefined
    const zones = iotCtx?.zones ?? []
    const herds = iotCtx?.herds ?? []
    const tasks = iotCtx?.tasks ?? []
    const moist = zones
      .map((z) => z.soil_moisture_0_5)
      .filter((x): x is number => x != null && Number.isFinite(x))
    const avgMoisture01 = moist.length ? moist.reduce((a, b) => a + b, 0) / moist.length : null
    return buildAnalyticsBreakdownLines({
      lang,
      farmsCount: summary.farms_count,
      zones,
      herds,
      tasks,
      avgMoisture01,
    })
  }, [summary, iotCtx, lang])

  const aiScoreRows = useMemo(() => {
    if (analytics) {
      return [
        {
          k: t(lang, 'aiScans'),
          v: String(analytics.scans),
          title: t(lang, 'aiHintScans'),
        },
        {
          k: t(lang, 'aiDataQuality'),
          v: analytics.data_quality.toFixed(2),
          title: t(lang, 'aiHintDataQuality'),
        },
        {
          k: t(lang, 'aiCropCond'),
          v: analytics.crop_condition.toFixed(2),
          title: t(lang, 'aiHintCrop'),
        },
        {
          k: t(lang, 'aiAnimalCond'),
          v: analytics.animal_health.toFixed(2),
          title: t(lang, 'aiHintAnimal'),
        },
        {
          k: t(lang, 'aiWater'),
          v: analytics.water_supply.toFixed(2),
          title: t(lang, 'aiHintWater'),
        },
      ]
    }
    if (!summary) return []
    return [
      {
        k: t(lang, 'aiScans'),
        v: String(summary.zones_total + summary.herds_total + summary.today_tasks_total),
        title: t(lang, 'aiHintScans'),
      },
      {
        k: t(lang, 'aiDataQuality'),
        v: summary.farms_count > 0 ? '0.50' : '0.35',
        title: t(lang, 'aiHintDataQuality'),
      },
      {
        k: t(lang, 'aiCropCond'),
        v: summary.zones_total > 0 ? '0.50' : '0.35',
        title: t(lang, 'aiHintCrop'),
      },
      {
        k: t(lang, 'aiAnimalCond'),
        v: summary.herds_total > 0 ? '0.50' : '0.35',
        title: t(lang, 'aiHintAnimal'),
      },
      { k: t(lang, 'aiWater'), v: '0.45', title: t(lang, 'aiHintWater') },
    ]
  }, [analytics, summary, lang])

  const recLabel = (id: string) => {
    if (id === 'vet') return t(lang, 'recVet')
    if (id === 'harvest') return t(lang, 'recHarvest')
    if (id === 'devices') return t(lang, 'recDevices')
    return id
  }

  const recPriorityClass = (p: string) => {
    if (p === 'high') return 'rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800'
    if (p === 'medium') return 'rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900'
    return 'rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700'
  }

  const dashboardZonesSig = useMemo(
    () => (iotCtx?.zones ?? []).map((z) => `${z.id}:${z.soil_moisture_0_5 ?? ''}`).join('|'),
    [iotCtx?.zones],
  )

  return (
    <div className="relative space-y-8">
      <div className="dash-toolbar sticky top-0 z-10 -mx-4 mb-2 flex flex-col gap-4 border-b px-4 py-3 md:-mx-8 md:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
            {t(lang, 'dashboardSystemTitle')}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{t(lang, 'tagline')}</p>
        </div>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-500"
        >
          <Plus className="h-5 w-5" />
          {t(lang, 'addFarm')}
        </button>
      </div>

      {err ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </p>
      ) : null}

      {loading ? (
        <div className="fx-panel rounded-3xl">
          <LoadingBlock lang={lang} />
        </div>
      ) : summary ? (
        <>
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1 space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div
                  className={`rounded-2xl border p-4 shadow-sm ${
                    summary.overdue_total > 0
                      ? 'border-red-200 bg-red-50/70'
                      : 'border-emerald-200/80 bg-emerald-50/35'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {t(lang, 'kpiOverdue')}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-stone-900">{summary.overdue_total}</p>
                </div>
                <div className="fx-panel-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {t(lang, 'kpiToday')}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-stone-900">{summary.today_tasks_total}</p>
                </div>
                <div className="fx-panel-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {t(lang, 'kpiLand')}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-stone-900">
                    {summary.zones_total}
                    <span className="text-base font-semibold text-stone-400"> + </span>
                    {summary.herds_total}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {t(lang, 'fieldsShort')} / {t(lang, 'animalsShort')}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                      {t(lang, 'dashboardAiTeaser')}
                    </p>
                    {health ? (
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-600">
                        <span className="font-semibold text-stone-700">LLM:</span>
                        {health.llm === 'openai' ? (
                          <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 font-medium text-emerald-950">
                            OpenAI
                          </span>
                        ) : health.llm === 'gemini' ? (
                          <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 font-medium text-emerald-950">
                            Gemini
                          </span>
                        ) : (
                          <span className="rounded-full bg-stone-200 px-2 py-0.5 font-medium text-stone-800">
                            {lang === 'ru' ? 'выключен' : 'off'}
                          </span>
                        )}
                        {health.openai === 'invalid_key_format' ? (
                          <span className="text-amber-900">
                            {lang === 'ru'
                              ? 'OPENAI_API_KEY должен начинаться с sk-'
                              : 'OPENAI_API_KEY must start with sk-'}
                          </span>
                        ) : null}
                        {health.openai === 'missing' && health.llm === 'off' ? (
                          <span className="text-stone-600">
                            {lang === 'ru'
                              ? 'Задайте OPENAI_API_KEY или GEMINI_API_KEY в .env'
                              : 'Set OPENAI_API_KEY or GEMINI_API_KEY in .env'}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {analytics?.insight_critical ? (
                      <p className="mt-2 text-sm font-medium text-red-900">{analytics.insight_critical}</p>
                    ) : analytics?.insight_warning ? (
                      <p className="mt-2 text-sm font-medium text-amber-900">{analytics.insight_warning}</p>
                    ) : analytics?.scan_caption ? (
                      <p className="mt-2 text-sm text-stone-700">{analytics.scan_caption}</p>
                    ) : (
                      <p className="mt-2 text-sm text-stone-600">{t(lang, 'dashboardAiTeaserEmpty')}</p>
                    )}
                  </div>
                  <Link
                    to="/ai-analytics"
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
                  >
                    {t(lang, 'dashboardOpenFullAi')}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSensorsAndAi((v) => !v)}
                  className="fx-btn-ghost mt-4 flex w-full items-center justify-center gap-2 py-2.5 text-sm font-semibold"
                >
                  {showSensorsAndAi ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      {t(lang, 'dashboardCollapseSensorsAi')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      {t(lang, 'dashboardExpandSensorsAi')}
                    </>
                  )}
                </button>
              </div>

              {showSensorsAndAi ? (
                <div className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <IotPreviewSection
                      lang={lang}
                      snap={iotSnap}
                      weatherAvailable={iotCtx?.weather.available !== false}
                      subtitle={
                        iotCtx?.weather.available === false
                          ? lang === 'ru'
                            ? 'Погода недоступна — часть метрик без API.'
                            : 'Weather unavailable — some metrics omit API data.'
                          : t(lang, 'iotZoneSensorHint')
                      }
                      busy={iotBusy || loading}
                      onAddDevice={() => void onAddDevice()}
                      onSyncReadings={() => void onSyncReadings()}
                    />
                    <AiAnalyticsSection
                      lang={lang}
                      aiScoreRows={aiScoreRows}
                      analytics={analytics}
                      summaryFallback={
                        summary
                          ? {
                              overdue_total: summary.overdue_total,
                              today_tasks_total: summary.today_tasks_total,
                              zones_total: summary.zones_total,
                              herds_total: summary.herds_total,
                              farms_count: summary.farms_count,
                            }
                          : null
                      }
                      analyzeBusy={analyzeBusy || loading}
                      lastAnalyzedAt={lastAnalyzedAt}
                      onAnalyze={() => void runAnalyze()}
                      recLabel={recLabel}
                      recPriorityClass={recPriorityClass}
                      recommendationRows={
                        analytics?.recommendations ?? [
                          { id: 'vet', priority: 'high' as const },
                          { id: 'harvest', priority: 'medium' as const },
                          { id: 'devices', priority: 'low' as const },
                        ]
                      }
                      insightInfoFallback={
                        lang === 'ru'
                          ? 'Откройте вкладку ИИ-агента на ферме для персональных рекомендаций.'
                          : 'Open the AI agent tab on a farm for tailored recommendations.'
                      }
                      indicesBreakdownLines={indicesBreakdownLines}
                      onLoadDemoData={() => void onLoadDemoAi()}
                      loadDemoDataBusy={demoAiBusy}
                      loadDemoDataLabel={t(lang, 'btnLoadDemoAi')}
                      onCreateActivity={(s) => void onCreateActivity(s)}
                      creatingActivityKey={creatingActivityKey}
                      createdActivityKeys={createdActivityKeys}
                    />
                  </div>

                  <DashboardVegetationStrip
                    lang={lang}
                    farmId={farms[0]?.id ?? null}
                    farmName={farms[0]?.name ?? null}
                    zonesSig={dashboardZonesSig}
                  />
                </div>
              ) : null}

          <div className="grid gap-6 lg:grid-cols-5">
            <section className="fx-panel rounded-3xl lg:col-span-3">
              <h2 className="text-lg font-semibold text-stone-900">{t(lang, 'recentActivity')}</h2>
              <ul className="mt-4 divide-y divide-stone-100">
                {summary.recent_tasks.length === 0 ? (
                  <li className="py-8 text-center text-sm text-stone-500">
                    {lang === 'ru' ? 'Задач пока нет' : 'No tasks yet'}
                  </li>
                ) : (
                  summary.recent_tasks.slice(0, 5).map((task) => (
                    <li key={`${task.farm_id}-${task.id}`} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-900">{task.title}</p>
                        <p className="text-xs text-stone-500">
                          {farmNameById(task.farm_id)} · {task.kind} · {task.status}
                          {task.due_at
                            ? ` · ${formatFarmDateTime(task.due_at, lang)}`
                            : ''}
                        </p>
                      </div>
                      <Link
                        to={`/farm/${task.farm_id}`}
                        className="shrink-0 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50"
                      >
                        {t(lang, 'openFarm')}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
              {summary.recent_tasks.length > 5 ? (
                <p className="mt-3 text-center text-xs text-stone-400">
                  {t(lang, 'dashboardMoreInList')}: {summary.recent_tasks.length - 5}{' '}
                  {lang === 'ru' ? '— откройте ферму из списка справа' : '— open a farm from the list'}
                </p>
              ) : null}
            </section>

            <section className="fx-panel rounded-3xl lg:col-span-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-stone-900">{t(lang, 'notifications')}</h2>
                <button
                  type="button"
                  onClick={() => void onSyncNotifs()}
                  className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:border-emerald-300 hover:text-emerald-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t(lang, 'refreshNotifications')}
                </button>
              </div>
              <ul className="mt-4 max-h-[280px] space-y-3 overflow-y-auto pr-1">
                {notifs.length === 0 ? (
                  <li className="py-6 text-center text-sm text-stone-500">
                    {lang === 'ru' ? 'Нет уведомлений' : 'No notifications'}
                  </li>
                ) : (
                  notifs.slice(0, 5).map((n) => (
                    <li
                      key={n.id}
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        n.read_at
                          ? 'border-stone-100 bg-stone-50/80 text-stone-500'
                          : 'border-amber-100 bg-amber-50/60 text-stone-800'
                      }`}
                    >
                      <p className="font-semibold text-stone-900">{n.title}</p>
                      <p className="mt-1 text-stone-600">{n.body}</p>
                      {!n.read_at ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-emerald-700 hover:underline"
                          onClick={() => void onMarkRead(n.id)}
                        >
                          {lang === 'ru' ? 'Прочитано' : 'Mark read'}
                        </button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
              {notifs.length > 5 ? (
                <p className="mt-3 text-center text-xs text-stone-400">
                  {t(lang, 'dashboardMoreInList')}: {notifs.length - 5}{' '}
                  {lang === 'ru' ? '— смотрите колокольчик в шапке' : '— see the bell in the header'}
                </p>
              ) : null}
            </section>
          </div>
            </div>

            <aside
              className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:z-[5] xl:max-h-[calc(100dvh-5.5rem)] xl:w-72 xl:overflow-y-auto xl:overscroll-contain xl:pr-1"
              id="my-farms"
            >
              <div className="fx-panel-sm">
                <h3 className="text-sm font-bold text-stone-900">{t(lang, 'farmsSidebarTitle')}</h3>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                  {t(lang, 'allFarmsSummary')}: {summary.farms_count}{' '}
                  {lang === 'ru' ? 'ферм' : 'farms'} · {summary.zones_total} {t(lang, 'fieldsShort')} ·{' '}
                  {summary.herds_total} {t(lang, 'animalsShort')}
                </p>
                <p className="mt-2 text-[11px] text-stone-400">
                  {t(lang, 'devicesShort')}:{' '}
                  {analytics != null
                    ? analytics.devices_total
                    : summary.zones_total + summary.herds_total}
                </p>
              </div>
              <div className="space-y-3">
                {farms.map((f) => (
                  <Link
                    key={f.id}
                    to={`/farm/${f.id}`}
                    className="fx-panel-sm block transition hover:border-emerald-300/80 hover:shadow-md hover:shadow-emerald-900/5"
                  >
                    <p className="font-semibold text-stone-900">{f.name}</p>
                    <p className="mt-0.5 text-xs text-stone-500">{f.region || '—'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900">
                        {t(lang, 'alerts')}: {f.alerts_count}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900">
                        {t(lang, 'today')}: {f.today_tasks}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        </>
      ) : null}

      {!summary && !farms.length && !err && !loading ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-16 text-center">
          <p className="text-stone-600">{lang === 'ru' ? 'Добавьте первую ферму' : 'Add your first farm'}</p>
        </div>
      ) : null}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/35 p-4 backdrop-blur-sm">
          <div className="fx-card w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-stone-900">{t(lang, 'addFarm')}</h3>
            <form onSubmit={addFarm} className="mt-4 space-y-3">
              <input
                placeholder={t(lang, 'farmName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="fx-input"
                required
              />
              <input
                placeholder={t(lang, 'region')}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="fx-input"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'error'}
        onClose={() => setToast(null)}
      />
    </div>
  )
}
