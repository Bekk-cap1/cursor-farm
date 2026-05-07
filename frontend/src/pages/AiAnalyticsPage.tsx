import { ArrowLeft, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AiAnalyticsSection } from '../components/analytics/AiAnalyticsSection'
import { DashboardVegetationStrip } from '../components/DashboardVegetationStrip'
import { ExportPanel } from '../components/ExportPanel'
import { LoadingBlock } from '../components/LoadingBlock'
import { Toast } from '../components/Toast'
import { useLang } from '../context/LangContext'
import * as api from '../lib/api'
import { t } from '../i18n/strings'
import { buildAnalyticsBreakdownLines } from '../lib/farmAiEngine'
import { invalidateOverview, saveOverview, tryReadOverview } from '../lib/pageDataCache'

type PageToast = { message: string; variant: 'error' | 'success' }

export default function AiAnalyticsPage() {
  const { lang } = useLang()
  const [summary, setSummary] = useState<api.DashboardSummary | null>(null)
  const [farms, setFarms] = useState<api.FarmSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [analytics, setAnalytics] = useState<api.DashboardAnalyze | null>(null)
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<number | null>(null)
  const [toast, setToast] = useState<PageToast | null>(null)
  const [demoAiBusy, setDemoAiBusy] = useState(false)
  const [creatingActivityKey, setCreatingActivityKey] = useState<string | null>(null)
  const [createdActivityKeys, setCreatedActivityKeys] = useState<string[]>([])
  const [iotCtx, setIotCtx] = useState<{
    weather: Awaited<ReturnType<typeof api.fetchWeather>>
    zones: api.FieldZone[]
    herds: api.HerdGroup[]
    tasks: api.Task[]
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const [dash, farmList] = await Promise.all([
        api.fetchDashboardSummary(),
        api.fetchFarms(),
      ])
      setSummary(dash)
      setFarms(farmList)
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

  const loadRef = useRef(load)
  loadRef.current = load

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
      return
    }
    void loadRef.current()
  }, [lang])

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
        { k: t(lang, 'aiScans'), v: String(analytics.scans), title: t(lang, 'aiHintScans') },
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
    <div className="mx-auto max-w-6xl space-y-6 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Sparkles className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
              {t(lang, 'aiAnalyticsPageTitle')}
            </h1>
            <p className="mt-1 text-sm text-stone-500">{t(lang, 'aiAnalyticsPageLead')}</p>
          </div>
        </div>
        <Link
          to="/"
          className="fx-btn-ghost inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          {t(lang, 'backToDashboard')}
        </Link>
      </div>

      {err ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p>
      ) : null}

      {loading ? (
        <div className="fx-panel rounded-3xl">
          <LoadingBlock lang={lang} />
        </div>
      ) : summary ? (
        <div className="space-y-6">
          <AiAnalyticsSection
            lang={lang}
            headerVariant="toolbar"
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
                ? 'Откройте ферму — вкладка «ИИ-агент» для диалога по конкретному хозяйству.'
                : 'Open a farm — AI agent tab for chat about that operation.'
            }
            indicesBreakdownLines={indicesBreakdownLines}
            onLoadDemoData={() => void onLoadDemoAi()}
            loadDemoDataBusy={demoAiBusy}
            loadDemoDataLabel={t(lang, 'btnLoadDemoAi')}
            onCreateActivity={(s) => void onCreateActivity(s)}
            creatingActivityKey={creatingActivityKey}
            createdActivityKeys={createdActivityKeys}
          />

          <DashboardVegetationStrip
            lang={lang}
            farmId={farms[0]?.id ?? null}
            farmName={farms[0]?.name ?? null}
            zonesSig={dashboardZonesSig}
          />

          <ExportPanel
            lang={lang}
            summary={summary}
            analytics={analytics}
            farms={farms}
            iotCtx={iotCtx}
          />
        </div>
      ) : (
        <p className="text-sm text-stone-500">{lang === 'ru' ? 'Нет данных.' : 'No data.'}</p>
      )}

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'error'}
        onClose={() => setToast(null)}
      />
    </div>
  )
}
