import {
  ArrowLeft,
  Beef,
  Bot,
  CheckCircle2,
  CloudSun,
  Droplets,
  ListTodo,
  Loader2,
  MapPinned,
  Plus,
  Sparkles,
  Sprout,
  Trash2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AiAnalyticsSection } from '../components/analytics/AiAnalyticsSection'
import { IotPreviewSection } from '../components/analytics/IotPreviewSection'
import { LoadingBlock } from '../components/LoadingBlock'
import { Toast } from '../components/Toast'
import { VegetationSparkline } from '../components/VegetationSparkline'
import { useLang } from '../context/LangContext'
import * as api from '../lib/api'
import { formatFarmDateTime } from '../lib/datetime'
import { buildAnalyticsBreakdownLines } from '../lib/farmAiEngine'
import { computeIotSnapshot } from '../lib/iotMetrics'
import { invalidateFarmCore, saveFarmCore, tryReadFarmCore } from '../lib/pageDataCache'
import type { Lang } from '../i18n/strings'
import { t } from '../i18n/strings'

type Tab = 'overview' | 'fields' | 'herds' | 'tasks' | 'team' | 'agent'

type FarmToast = { message: string; variant: 'error' | 'success' }

const INPUT_CLASS =
  'mt-1 fx-input px-3 py-2.5 text-sm shadow-none placeholder:text-slate-500'
const BTN_PRIMARY =
  'fx-btn-inline px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 disabled:opacity-50'
const BTN_DANGER =
  'fx-btn-danger px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/25'

function kindLabel(lang: Lang, k: string) {
  if (k === 'irrigation') return t(lang, 'irrigation')
  if (k === 'feeding') return t(lang, 'feeding')
  return t(lang, 'other')
}

function irrigLabel(lang: Lang, code: string): string {
  const c = (code || '').toLowerCase()
  if (c === 'drip') return t(lang, 'irrigDrip')
  if (c === 'sprinkler') return t(lang, 'irrigSprinkler')
  if (c === 'flood') return t(lang, 'irrigFlood')
  return code ? `${t(lang, 'irrigOther')}: ${code}` : '—'
}

function animalLabel(lang: Lang, code: string): string {
  const c = (code || '').toLowerCase()
  if (c === 'cattle') return t(lang, 'animalCattle')
  if (c === 'sheep') return t(lang, 'animalSheep')
  if (c === 'goat' || c === 'goats') return t(lang, 'animalGoat')
  if (c === 'pig' || c === 'pigs') return t(lang, 'animalPig')
  if (c === 'other') return t(lang, 'animalOther')
  return code || '—'
}

function memberRoleLabel(lang: Lang, r: string): string {
  if (r === 'owner') return lang === 'ru' ? 'Владелец' : 'Owner'
  if (r === 'manager') return t(lang, 'roleManager')
  if (r === 'viewer') return t(lang, 'roleViewer')
  if (r === 'agronomist') return t(lang, 'roleAgronomist')
  if (r === 'livestock') return t(lang, 'roleLivestock')
  if (r === 'field_worker') return t(lang, 'roleFieldWorker')
  return r
}

const TAB_SET = new Set<Tab>(['overview', 'fields', 'herds', 'tasks', 'team', 'agent'])

const FULL_TABS: Tab[] = ['overview', 'fields', 'herds', 'tasks', 'team', 'agent']

/** `undefined` = role not loaded yet — show all tabs until summary returns. */
function visibleTabIdsForRole(role: string | undefined): Tab[] | null {
  if (role === undefined) return null
  if (role === 'owner' || role === 'manager') return [...FULL_TABS]
  if (role === 'viewer') return ['overview']
  if (role === 'agronomist') return ['fields']
  if (role === 'livestock') return ['herds']
  if (role === 'field_worker') return ['tasks']
  return [...FULL_TABS]
}

export default function FarmPage() {
  const { farmId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = Number(farmId)
  const { lang } = useLang()
  const tabFromUrl = searchParams.get('tab')
  const initialTab: Tab =
    tabFromUrl && TAB_SET.has(tabFromUrl as Tab) ? (tabFromUrl as Tab) : 'overview'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [farm, setFarm] = useState<api.Farm | null>(null)
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [weather, setWeather] = useState<Awaited<ReturnType<typeof api.fetchWeather>> | null>(null)
  const [farmAnalytics, setFarmAnalytics] = useState<api.DashboardAnalyze | null>(null)
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<number | null>(null)
  const [toast, setToast] = useState<FarmToast | null>(null)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [demoAiBusy, setDemoAiBusy] = useState(false)
  const [creatingActivityKey, setCreatingActivityKey] = useState<string | null>(null)
  const [createdActivityKeys, setCreatedActivityKeys] = useState<string[]>([])
  const [iotBusy, setIotBusy] = useState(false)
  const [zones, setZones] = useState<api.FieldZone[]>([])
  const [vegSeriesByZone, setVegSeriesByZone] = useState<Record<number, api.VegetationProxyPoint[]>>({})
  const [vegDisclaimer, setVegDisclaimer] = useState<string | null>(null)
  const [vegDays, setVegDays] = useState<14 | 30 | 60 | 90>(30)
  const [moistureHistoryByZone, setMoistureHistoryByZone] = useState<
    Record<number, api.TelemetryPoint[]>
  >({})
  const [herds, setHerds] = useState<api.HerdGroup[]>([])
  const [tasks, setTasks] = useState<api.Task[]>([])
  const [members, setMembers] = useState<api.FarmMember[]>([])
  const [teamMembersLoading, setTeamMembersLoading] = useState(false)
  const [teamErr, setTeamErr] = useState<string | null>(null)
  const [teamBusy, setTeamBusy] = useState(false)
  const [deletingMemberUserId, setDeletingMemberUserId] = useState<number | null>(null)
  const [pEmail, setPEmail] = useState('')
  const [pFirstName, setPFirstName] = useState('')
  const [pLastName, setPLastName] = useState('')
  const [pPhone, setPPhone] = useState('')
  const [pNiche, setPNiche] = useState('')
  const [pPassword, setPPassword] = useState('')
  const [pPassword2, setPPassword2] = useState('')
  const [pRole, setPRole] = useState('agronomist')
  const [err, setErr] = useState<string | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [zoneBusy, setZoneBusy] = useState(false)
  const [herdBusy, setHerdBusy] = useState(false)
  const [taskBusy, setTaskBusy] = useState(false)
  const [deleteZoneId, setDeleteZoneId] = useState<number | null>(null)
  const [deleteHerdId, setDeleteHerdId] = useState<number | null>(null)
  const [completeTaskId, setCompleteTaskId] = useState<number | null>(null)

  const [zName, setZName] = useState('')
  const [zCrop, setZCrop] = useState('')
  const [zIrrig, setZIrrig] = useState('drip')
  const [zArea, setZArea] = useState('')
  const [hName, setHName] = useState('')
  const [hHeads, setHHeads] = useState(0)
  const [hAnimal, setHAnimal] = useState('cattle')
  const [hNotes, setHNotes] = useState('')
  const [tTitle, setTTitle] = useState('')
  const [tKind, setTKind] = useState('other')

  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([
    {
      role: 'assistant',
      content:
        lang === 'ru'
          ? 'Я главный центр советов по этой ферме: полив, стада, задачи, закупки (как план), погода. Спросите или попросите создать задачу — уведомления придут в колокольчик.'
          : 'I’m your main hub for this farm: irrigation, herds, tasks, buying/selling plans, weather. Ask anything or request a task — check the bell for alerts.',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(id)) return
    try {
      const [f, s, w, z, h, tk] = await Promise.all([
        api.fetchFarm(id),
        api.fetchFarmSummary(id),
        api.fetchWeather(id),
        api.fetchZones(id),
        api.fetchHerds(id),
        api.fetchTasks(id),
      ])
      setFarm(f)
      setSummary(s)
      setWeather(w)
      setZones(z)
      setHerds(h)
      setTasks(tk)
      setErr(null)
      setInitialLoad(false)

      let farmAnalytics: api.DashboardAnalyze | null = null
      let analyzedAt: number | null = null
      try {
        farmAnalytics = await api.postFarmAnalyze(id, lang)
        analyzedAt = Date.now()
        setFarmAnalytics(farmAnalytics)
        setLastAnalyzedAt(analyzedAt)
      } catch {
        setFarmAnalytics(null)
        farmAnalytics = null
        analyzedAt = null
      }

      saveFarmCore(id, lang, {
        farm: f,
        summary: s,
        weather: w,
        zones: z,
        herds: h,
        tasks: tk,
        farmAnalytics,
        lastAnalyzedAt: analyzedAt,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      setInitialLoad(false)
    }
  }, [id, lang])

  useEffect(() => {
    if (!Number.isFinite(id)) return
    const snap = tryReadFarmCore(id, lang)
    if (snap) {
      setFarm(snap.farm)
      setSummary(snap.summary)
      setWeather(snap.weather)
      setZones(snap.zones)
      setHerds(snap.herds)
      setTasks(snap.tasks)
      setFarmAnalytics(snap.farmAnalytics)
      setLastAnalyzedAt(snap.lastAnalyzedAt)
      setErr(null)
      setInitialLoad(false)
      return
    }
    void loadAll()
  }, [id, lang, loadAll])

  useEffect(() => {
    if (tab !== 'team' || !Number.isFinite(id)) return
    setTeamMembersLoading(true)
    void (async () => {
      try {
        const m = await api.fetchFarmMembers(id)
        setMembers(m)
        setTeamErr(null)
      } catch (e) {
        setTeamErr(e instanceof Error ? e.message : 'Error')
      } finally {
        setTeamMembersLoading(false)
      }
    })()
  }, [tab, id])

  useEffect(() => {
    const p = searchParams.get('tab')
    if (p && TAB_SET.has(p as Tab)) setTab(p as Tab)
  }, [searchParams])

  useEffect(() => {
    if (!farmId || !Number.isFinite(id)) return
    if (!searchParams.get('tab')) {
      navigate(`/farm/${farmId}?tab=overview`, { replace: true })
    }
  }, [farmId, id, navigate, searchParams])

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content:
          lang === 'ru'
            ? 'Я главный центр советов по этой ферме: полив, стада, задачи, закупки (как план), погода. Спросите или попросите создать задачу — уведомления придут в колокольчик.'
            : 'I’m your main hub for this farm: irrigation, herds, tasks, buying/selling plans, weather. Ask anything or request a task — check the bell for alerts.',
      },
    ])
  }, [id])

  const tabs = useMemo(
    () =>
      [
        { id: 'overview' as const, label: t(lang, 'overview'), icon: MapPinned },
        { id: 'fields' as const, label: t(lang, 'fields'), icon: Sprout },
        { id: 'herds' as const, label: t(lang, 'herds'), icon: Beef },
        { id: 'tasks' as const, label: t(lang, 'tasks'), icon: ListTodo },
        { id: 'team' as const, label: t(lang, 'teamTab'), icon: Users },
        { id: 'agent' as const, label: t(lang, 'agent'), icon: Bot },
      ] as const,
    [lang],
  )

  const selectTab = useCallback(
    (next: Tab) => {
      setTab(next)
      if (farmId) {
        navigate(`/farm/${farmId}?tab=${next}`, { replace: true })
      }
    },
    [farmId, navigate],
  )

  const overdueFarm = Number((summary as { alerts_overdue?: number } | null)?.alerts_overdue ?? 0)
  const myRole = (summary as { my_role?: string } | null)?.my_role
  const canProvisionTeam = myRole === 'owner' || myRole === 'manager'

  const navTabs = useMemo(() => {
    const ids = visibleTabIdsForRole(myRole)
    if (ids === null) return tabs
    return tabs.filter((x) => ids.includes(x.id))
  }, [tabs, myRole])

  useEffect(() => {
    const ids = visibleTabIdsForRole(myRole)
    if (ids === null || myRole === undefined) return
    if (!ids.includes(tab)) {
      selectTab(ids[0])
    }
  }, [myRole, tab, selectTab])

  const iotSnap = useMemo(
    () => computeIotSnapshot(weather, zones, herds, tasks),
    [weather, zones, herds, tasks],
  )

  const zonesVegSig = useMemo(
    () => zones.map((z) => `${z.id}:${z.soil_moisture_0_5 ?? ''}`).join('|'),
    [zones],
  )

  useEffect(() => {
    if (tab !== 'fields' || !Number.isFinite(id) || zones.length === 0) {
      setVegSeriesByZone({})
      setVegDisclaimer(null)
      setMoistureHistoryByZone({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [list, ...telemetrySeries] = await Promise.all([
          api.fetchVegetationProxySeries(id, { days: vegDays, lang }),
          ...zones.map((z) =>
            api.fetchZoneTelemetry(id, z.id, { metric: 'soil_moisture_0_5', days: vegDays }),
          ),
        ])
        if (cancelled) return
        const map: Record<number, api.VegetationProxyPoint[]> = {}
        for (const s of list) {
          map[s.zone_id] = s.points
        }
        setVegSeriesByZone(map)
        setVegDisclaimer(list[0]?.disclaimer ?? null)
        const mh: Record<number, api.TelemetryPoint[]> = {}
        zones.forEach((z, i) => {
          mh[z.id] = telemetrySeries[i]?.points ?? []
        })
        setMoistureHistoryByZone(mh)
      } catch {
        if (!cancelled) {
          setVegSeriesByZone({})
          setVegDisclaimer(null)
          setMoistureHistoryByZone({})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, id, zonesVegSig, lang, vegDays])

  const indicesBreakdownLines = useMemo(() => {
    const moist = zones
      .map((z) => z.soil_moisture_0_5)
      .filter((x): x is number => x != null && Number.isFinite(x))
    const avgMoisture01 = moist.length ? moist.reduce((a, b) => a + b, 0) / moist.length : null
    return buildAnalyticsBreakdownLines({
      lang,
      farmsCount: 1,
      zones,
      herds,
      tasks,
      avgMoisture01,
    })
  }, [lang, zones, herds, tasks])

  const aiScoreRows = useMemo(() => {
    if (!farmAnalytics) return []
    return [
      { k: t(lang, 'aiScans'), v: String(farmAnalytics.scans), title: t(lang, 'aiHintScans') },
      {
        k: t(lang, 'aiDataQuality'),
        v: farmAnalytics.data_quality.toFixed(2),
        title: t(lang, 'aiHintDataQuality'),
      },
      {
        k: t(lang, 'aiCropCond'),
        v: farmAnalytics.crop_condition.toFixed(2),
        title: t(lang, 'aiHintCrop'),
      },
      {
        k: t(lang, 'aiAnimalCond'),
        v: farmAnalytics.animal_health.toFixed(2),
        title: t(lang, 'aiHintAnimal'),
      },
      { k: t(lang, 'aiWater'), v: farmAnalytics.water_supply.toFixed(2), title: t(lang, 'aiHintWater') },
    ]
  }, [farmAnalytics, lang])

  const onFarmLoadDemoAi = useCallback(async () => {
    if (!Number.isFinite(id)) return
    setDemoAiBusy(true)
    setToast(null)
    try {
      const res = await api.postDashboardDemoAiData(id)
      await loadAll()
      try {
        setFarmAnalytics(await api.postFarmAnalyze(id, lang))
        setLastAnalyzedAt(Date.now())
        setCreatedActivityKeys([])
        invalidateFarmCore(id)
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
  }, [id, lang, loadAll])

  const runFarmAnalyze = useCallback(async () => {
    setAnalyzeBusy(true)
    setToast(null)
    try {
      setFarmAnalytics(await api.postFarmAnalyze(id, lang))
      setLastAnalyzedAt(Date.now())
      setCreatedActivityKeys([])
      invalidateFarmCore(id)
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setAnalyzeBusy(false)
    }
  }, [id, lang])

  const onCreateActivity = useCallback(
    async (s: api.ActivitySuggestion) => {
      if (s.farm_id !== id) return
      setCreatingActivityKey(s.key)
      setToast(null)
      try {
        await api.createTask(id, {
          title: `[AI] ${s.title}`,
          kind: s.kind,
          description: s.description,
        })
        setCreatedActivityKeys((prev) => [...prev, s.key])
        setToast({ message: t(lang, 'activityCreatedToast'), variant: 'success' })
        window.dispatchEvent(new Event('notifications-refresh'))
        await loadAll()
      } catch (e) {
        setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
      } finally {
        setCreatingActivityKey(null)
      }
    },
    [id, lang, loadAll],
  )

  const onFarmIotSync = useCallback(async () => {
    setIotBusy(true)
    setToast(null)
    try {
      await api.syncZoneReadings(id)
      await loadAll()
      setToast({ message: t(lang, 'iotReadingsSyncedToast'), variant: 'success' })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setIotBusy(false)
    }
  }, [id, lang, loadAll])

  const onFarmIotAddDevice = useCallback(async () => {
    if (!Number.isFinite(id)) {
      setToast({
        message: lang === 'ru' ? 'Некорректный адрес фермы' : 'Invalid farm URL',
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
      await api.createZone(id, {
        name: label.slice(0, 200),
        irrigation_type: 'drip',
        soil_moisture_0_5: 3,
      })
      const z = await api.fetchZones(id)
      setZones(z)
      selectTab('fields')
      setToast({ message: t(lang, 'zoneAddedToast'), variant: 'success' })
      void loadAll()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Error', variant: 'error' })
    } finally {
      setIotBusy(false)
    }
  }, [id, lang, loadAll, selectTab])

  function farmRecLabel(recId: string) {
    if (recId === 'vet') return t(lang, 'recVet')
    if (recId === 'harvest') return t(lang, 'recHarvest')
    if (recId === 'devices') return t(lang, 'recDevices')
    return recId
  }

  function farmRecPriorityClass(p: string) {
    if (p === 'high') return 'rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800'
    if (p === 'medium') return 'rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900'
    return 'rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700'
  }

  async function addZone(e: React.FormEvent) {
    e.preventDefault()
    setZoneBusy(true)
    try {
      const area = zArea.trim() ? Number(zArea.replace(',', '.')) : null
      await api.createZone(id, {
        name: zName.trim(),
        crop_type: zCrop.trim() || null,
        irrigation_type: zIrrig,
        area_ha: Number.isFinite(area) ? area : null,
      })
      setZName('')
      setZCrop('')
      setZIrrig('drip')
      setZArea('')
      await loadAll()
    } finally {
      setZoneBusy(false)
    }
  }

  async function addHerd(e: React.FormEvent) {
    e.preventDefault()
    setHerdBusy(true)
    try {
      await api.createHerd(id, {
        name: hName.trim(),
        head_count: hHeads,
        animal_type: hAnimal,
        feeding_notes: hNotes.trim() || null,
      })
      setHName('')
      setHHeads(0)
      setHAnimal('cattle')
      setHNotes('')
      await loadAll()
    } finally {
      setHerdBusy(false)
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    setTaskBusy(true)
    try {
      await api.createTask(id, { title: tTitle.trim(), kind: tKind })
      setTTitle('')
      setTKind('other')
      await loadAll()
    } finally {
      setTaskBusy(false)
    }
  }

  async function completeTask(taskId: number) {
    setCompleteTaskId(taskId)
    try {
      await api.patchTaskStatus(id, taskId, 'done')
      await loadAll()
    } finally {
      setCompleteTaskId(null)
    }
  }

  async function addTeamMember(e: React.FormEvent) {
    e.preventDefault()
    if (!canProvisionTeam) return
    if (pPassword !== pPassword2) {
      setTeamErr(lang === 'ru' ? 'Пароли не совпадают' : 'Passwords do not match')
      return
    }
    setTeamBusy(true)
    setTeamErr(null)
    try {
      await api.provisionFarmMember(id, {
        email: pEmail.trim(),
        password: pPassword,
        password_confirm: pPassword2,
        role: pRole,
        first_name: pFirstName.trim(),
        last_name: pLastName.trim(),
        phone: pPhone.trim() || null,
        niche: pNiche.trim() || null,
      })
      setPEmail('')
      setPFirstName('')
      setPLastName('')
      setPPhone('')
      setPNiche('')
      setPPassword('')
      setPPassword2('')
      setPRole('agronomist')
      setMembers(await api.fetchFarmMembers(id))
      setToast({
        message: lang === 'ru' ? 'Пользователь добавлен на ферму.' : 'User added to the farm.',
        variant: 'success',
      })
    } catch (e) {
      setTeamErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setTeamBusy(false)
    }
  }

  async function removeTeamMember(memberUserId: number, email: string) {
    if (!canProvisionTeam) return
    const ok = window.confirm(
      lang === 'ru'
        ? `Удалить пользователя ${email} из команды фермы?`
        : `Remove ${email} from the farm team?`,
    )
    if (!ok) return
    setDeletingMemberUserId(memberUserId)
    setTeamErr(null)
    try {
      await api.removeFarmMember(id, memberUserId)
      setMembers(await api.fetchFarmMembers(id))
      setToast({
        message: lang === 'ru' ? 'Пользователь удалён из фермы.' : 'User removed from the farm.',
        variant: 'success',
      })
    } catch (e) {
      setTeamErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setDeletingMemberUserId(null)
    }
  }

  async function sendChat() {
    const text = chatInput.trim()
    if (!text || chatBusy) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setChatInput('')
    setChatBusy(true)
    try {
      const { reply } = await api.postAgentChat({ farm_id: id, messages: next })
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
      window.dispatchEvent(new Event('notifications-refresh'))
      await loadAll()
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Error',
        },
      ])
    } finally {
      setChatBusy(false)
    }
  }

  if (!Number.isFinite(id)) {
    return <p className="text-stone-600">Bad id</p>
  }

  return (
    <div>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {lang === 'ru' ? 'Все фермы' : 'All farms'}
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">{farm?.name ?? '…'}</h1>
          <p className="text-stone-500">{farm?.region}</p>
          {myRole && ['agronomist', 'livestock', 'field_worker'].includes(myRole) ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                {memberRoleLabel(lang, myRole)}
              </span>
              <span>{t(lang, 'roleScopeLine')}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 via-white to-emerald-50/80 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              {t(lang, 'agentPrimary')}
            </p>
            <h2 className="mt-1 text-lg font-bold text-stone-900 sm:text-xl">{t(lang, 'agentHeroTitle')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{t(lang, 'agentHeroSubtitle')}</p>
            <p className="mt-3 text-sm text-stone-500">{t(lang, 'farmNavHint')}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-emerald-100/80 bg-white/70 px-4 py-6 text-center sm:max-w-[260px] sm:py-8">
            <Sparkles className="h-10 w-10 text-emerald-300" strokeWidth={1.25} aria-hidden />
            <p className="mt-2 text-xs leading-relaxed text-stone-500">{t(lang, 'agentHeroAside')}</p>
          </div>
        </div>
      </div>

      {err ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </p>
      ) : null}

      <nav
        className="mt-6 border-b border-stone-200"
        role="tablist"
        aria-label={lang === 'ru' ? 'Разделы фермы' : 'Farm sections'}
      >
        <div className="-mb-px flex flex-wrap gap-x-1 gap-y-0">
          {navTabs.map(({ id: tid, label, icon: Icon }) => {
            const active = tab === tid
            return (
              <button
                key={tid}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(tid)}
                className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition outline-none ${
                  active
                    ? '-mb-px border-emerald-600 font-semibold text-stone-900'
                    : 'border-transparent font-medium text-stone-500 hover:border-stone-300 hover:text-stone-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                {label}
              </button>
            )
          })}
        </div>
      </nav>

      {initialLoad && !err ? (
        <LoadingBlock lang={lang} className="mt-8 min-h-[min(40vh,320px)]" />
      ) : (
        <>
      {tab === 'overview' ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <IotPreviewSection
            lang={lang}
            snap={iotSnap}
            weatherAvailable={weather?.available !== false}
            subtitle={t(lang, 'iotZoneSensorHint')}
            busy={iotBusy}
            onAddDevice={() => void onFarmIotAddDevice()}
            onSyncReadings={() => void onFarmIotSync()}
          />
          <AiAnalyticsSection
            lang={lang}
            aiScoreRows={aiScoreRows}
            analytics={farmAnalytics}
            summaryFallback={{
              overdue_total: overdueFarm,
              today_tasks_total: Number((summary as { tasks_today?: number })?.tasks_today ?? 0),
              zones_total: zones.length,
              herds_total: herds.length,
              farms_count: 1,
            }}
            analyzeBusy={analyzeBusy}
            lastAnalyzedAt={lastAnalyzedAt}
            onAnalyze={() => void runFarmAnalyze()}
            recLabel={farmRecLabel}
            recPriorityClass={farmRecPriorityClass}
            recommendationRows={
              farmAnalytics?.recommendations ?? [
                { id: 'vet', priority: 'high' as const },
                { id: 'harvest', priority: 'medium' as const },
                { id: 'devices', priority: 'low' as const },
              ]
            }
            insightInfoFallback={
              lang === 'ru'
                ? 'Откройте вкладку ИИ-агента для диалога и задач по этой ферме.'
                : 'Open the AI agent tab to chat and create tasks for this farm.'
            }
            emptyNarrativeHint={
              farmAnalytics?.narrative
                ? undefined
                : lang === 'ru'
                  ? 'Нажмите «Анализировать» — расчёт выполняется на сервере (backend analyze API).'
                  : 'Tap Analyze — computation runs on the server (backend analyze API).'
            }
            indicesBreakdownLines={indicesBreakdownLines}
            onLoadDemoData={() => void onFarmLoadDemoAi()}
            loadDemoDataBusy={demoAiBusy}
            loadDemoDataLabel={t(lang, 'btnLoadDemoAi')}
            onCreateActivity={(s) => void onCreateActivity(s)}
            creatingActivityKey={creatingActivityKey}
            createdActivityKeys={createdActivityKeys}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {tab === 'overview' ? (
          <div className="grid gap-4 md:grid-cols-2">
            {canProvisionTeam ? (
              <div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-emerald-950">{t(lang, 'addWorkersShortcutTitle')}</h3>
                <p className="mt-1 text-sm text-stone-600">{t(lang, 'addWorkersShortcutHint')}</p>
                <button
                  type="button"
                  onClick={() => selectTab('team')}
                  className={`${BTN_PRIMARY} mt-4`}
                >
                  <Users className="h-4 w-4 shrink-0" aria-hidden />
                  {t(lang, 'btnGoToTeam')}
                </button>
              </div>
            ) : null}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                <Droplets className="h-4 w-4 text-sky-600" />
                {t(lang, 'irrigation')}
              </h3>
              <p className="mt-3 text-lg font-semibold text-stone-900">
                {(summary?.irrigation as { next_task?: string } | undefined)?.next_task ??
                  '—'}
              </p>
              <p className="text-sm text-stone-500">
                {formatFarmDateTime(
                  (summary?.irrigation as { next_due?: string } | undefined)?.next_due,
                  lang,
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
                <Beef className="h-4 w-4 text-amber-700" />
                {t(lang, 'herds')}
              </h3>
              <p className="mt-3 text-lg font-semibold text-stone-900">
                {(summary?.herd as { next_feeding_task?: string } | undefined)
                  ?.next_feeding_task ?? '—'}
              </p>
              <p className="text-sm text-stone-500">
                {formatFarmDateTime(
                  (summary?.herd as { next_due?: string } | undefined)?.next_due,
                  lang,
                )}
              </p>
            </div>
            <div
              className={`md:col-span-2 rounded-2xl border p-6 shadow-sm ${
                weather?.available === false
                  ? 'border-amber-200 bg-gradient-to-br from-amber-50/90 to-white'
                  : 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white'
              }`}
            >
              <h3 className="flex items-center gap-2 font-semibold text-emerald-900">
                <CloudSun className="h-5 w-5" />
                {t(lang, 'weather')}
              </h3>
              <p className="mt-3 text-stone-800 leading-relaxed">{weather?.summary_ru}</p>
            </div>
          </div>
        ) : null}

        {tab === 'fields' ? (
          <div className="space-y-6">
            <form
              onSubmit={addZone}
              className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
            >
              <div className="sm:col-span-1 lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'fieldLabelName')}
                </label>
                <input
                  value={zName}
                  onChange={(e) => setZName(e.target.value)}
                  className={INPUT_CLASS}
                  required
                  disabled={zoneBusy}
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'fieldLabelCrop')}
                </label>
                <input
                  value={zCrop}
                  onChange={(e) => setZCrop(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder={lang === 'ru' ? 'например, пшеница' : 'e.g. wheat'}
                  disabled={zoneBusy}
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'fieldLabelArea')}
                </label>
                <input
                  value={zArea}
                  onChange={(e) => setZArea(e.target.value)}
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  placeholder="12.5"
                  disabled={zoneBusy}
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'fieldLabelIrrigation')}
                </label>
                <select
                  value={zIrrig}
                  onChange={(e) => setZIrrig(e.target.value)}
                  className={INPUT_CLASS}
                  disabled={zoneBusy}
                >
                  <option value="drip">{t(lang, 'irrigDrip')}</option>
                  <option value="sprinkler">{t(lang, 'irrigSprinkler')}</option>
                  <option value="flood">{t(lang, 'irrigFlood')}</option>
                </select>
              </div>
              <div className="flex items-end lg:col-span-1">
                <button
                  type="submit"
                  disabled={zoneBusy}
                  className={`${BTN_PRIMARY} w-full lg:w-auto`}
                >
                  {zoneBusy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {t(lang, 'addField')}
                </button>
              </div>
            </form>
            {zones.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-2">
                {vegDisclaimer ? (
                  <p className="min-w-0 flex-1 text-xs text-emerald-900/90">{vegDisclaimer}</p>
                ) : (
                  <span className="text-xs text-emerald-800/70">{t(lang, 'vegChartLoading')}</span>
                )}
                <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-emerald-900">
                  <span>{t(lang, 'vegDaysLabel')}</span>
                  <select
                    value={vegDays}
                    onChange={(e) =>
                      setVegDays(Number(e.target.value) as 14 | 30 | 60 | 90)
                    }
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-stone-900 shadow-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
                  >
                    <option value={14}>{lang === 'ru' ? '14 дн.' : '14 d'}</option>
                    <option value={30}>{lang === 'ru' ? '30 дн.' : '30 d'}</option>
                    <option value={60}>{lang === 'ru' ? '60 дн.' : '60 d'}</option>
                    <option value={90}>{lang === 'ru' ? '90 дн.' : '90 d'}</option>
                  </select>
                </label>
              </div>
            ) : null}
            <ul className="space-y-4">
              {zones.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-10 text-center text-sm text-stone-500">
                  {t(lang, 'noZones')}
                </li>
              ) : null}
              {zones.map((z) => (
                <li
                  key={z.id}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-stone-900">{z.name}</h3>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-stone-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                            {t(lang, 'fieldLabelCrop')}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium text-stone-900">
                            {z.crop_type?.trim() ? z.crop_type : '—'}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-stone-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                            {t(lang, 'fieldLabelArea')}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium text-stone-900">
                            {z.area_ha != null && z.area_ha !== undefined
                              ? `${z.area_ha} ${lang === 'ru' ? 'га' : 'ha'}`
                              : '—'}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-stone-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                            {t(lang, 'fieldLabelIrrigation')}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium text-stone-900">
                            {irrigLabel(lang, z.irrigation_type)}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-stone-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                            {t(lang, 'fieldLabelMoisture')}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium text-stone-900">
                            {z.soil_moisture_0_5 != null ? `${z.soil_moisture_0_5} / 5` : '—'}
                            <span className="mt-1 block text-xs font-normal text-stone-500">
                              {t(lang, 'fieldMoistureHint')}
                            </span>
                          </dd>
                        </div>
                      </dl>
                      {(moistureHistoryByZone[z.id]?.length ?? 0) >= 2 ? (
                        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-sky-200 bg-sky-50/50 px-3 py-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-950">
                              {t(lang, 'moistureHistoryTitle')}
                            </p>
                            <p className="mt-0.5 text-[10px] text-sky-900/85">{t(lang, 'moistureHistoryHint')}</p>
                          </div>
                          <VegetationSparkline
                            points={(moistureHistoryByZone[z.id] ?? []).map((p) => ({
                              date: p.recorded_at.slice(0, 10),
                              value: p.value,
                            }))}
                            width={128}
                            height={40}
                          />
                        </div>
                      ) : vegSeriesByZone[z.id] && vegSeriesByZone[z.id].length >= 2 ? (
                        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-100 bg-emerald-50/35 px-3 py-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                              {t(lang, 'vegProxyTitle')}
                            </p>
                            <p className="mt-0.5 text-[10px] text-emerald-800/80">{t(lang, 'vegProxyScale')}</p>
                          </div>
                          <VegetationSparkline points={vegSeriesByZone[z.id]} width={128} height={40} />
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={BTN_DANGER}
                      disabled={deleteZoneId !== null}
                      onClick={async () => {
                        if (!window.confirm(t(lang, 'confirmDeleteZone'))) return
                        setDeleteZoneId(z.id)
                        try {
                          await api.deleteZone(id, z.id)
                          await loadAll()
                        } finally {
                          setDeleteZoneId(null)
                        }
                      }}
                    >
                      {deleteZoneId === z.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {t(lang, 'deleteZone')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === 'herds' ? (
          <div className="space-y-6">
            <form
              onSubmit={addHerd}
              className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
            >
              <div className="sm:col-span-1 lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'herdLabelName')}
                </label>
                <input
                  value={hName}
                  onChange={(e) => setHName(e.target.value)}
                  className={INPUT_CLASS}
                  required
                  disabled={herdBusy}
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'herdLabelType')}
                </label>
                <select
                  value={hAnimal}
                  onChange={(e) => setHAnimal(e.target.value)}
                  className={INPUT_CLASS}
                  disabled={herdBusy}
                >
                  <option value="cattle">{t(lang, 'animalCattle')}</option>
                  <option value="sheep">{t(lang, 'animalSheep')}</option>
                  <option value="goat">{t(lang, 'animalGoat')}</option>
                  <option value="pig">{t(lang, 'animalPig')}</option>
                  <option value="other">{t(lang, 'animalOther')}</option>
                </select>
              </div>
              <div className="sm:col-span-1 lg:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'herdLabelHeads')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={hHeads}
                  onChange={(e) => setHHeads(Number(e.target.value))}
                  className={INPUT_CLASS}
                  disabled={herdBusy}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'herdLabelRation')}
                </label>
                <input
                  value={hNotes}
                  onChange={(e) => setHNotes(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder={lang === 'ru' ? 'Сено, комбикорм…' : 'Hay, concentrate…'}
                  disabled={herdBusy}
                />
              </div>
              <div className="flex items-end lg:col-span-1">
                <button
                  type="submit"
                  disabled={herdBusy}
                  className={`${BTN_PRIMARY} w-full lg:w-auto`}
                >
                  {herdBusy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {t(lang, 'addHerd')}
                </button>
              </div>
            </form>
            <ul className="space-y-4">
              {herds.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-10 text-center text-sm text-stone-500">
                  {t(lang, 'noHerds')}
                </li>
              ) : null}
              {herds.map((h) => (
                <li
                  key={h.id}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-stone-900">{h.name}</h3>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-amber-50/80 px-3 py-2 ring-1 ring-amber-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/90">
                            {t(lang, 'herdLabelType')}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium text-stone-900">
                            {animalLabel(lang, h.animal_type)}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-amber-50/80 px-3 py-2 ring-1 ring-amber-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/90">
                            {t(lang, 'headCount')}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium text-stone-900">{h.head_count}</dd>
                        </div>
                        <div className="sm:col-span-2 rounded-xl bg-stone-50 px-3 py-3 ring-1 ring-stone-100">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                            {t(lang, 'herdSectionRation')}
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
                            {h.feeding_notes?.trim() ? h.feeding_notes : '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <button
                      type="button"
                      className={BTN_DANGER}
                      disabled={deleteHerdId !== null}
                      onClick={async () => {
                        if (!window.confirm(t(lang, 'confirmDeleteHerd'))) return
                        setDeleteHerdId(h.id)
                        try {
                          await api.deleteHerd(id, h.id)
                          await loadAll()
                        } finally {
                          setDeleteHerdId(null)
                        }
                      }}
                    >
                      {deleteHerdId === h.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {t(lang, 'deleteHerd')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === 'tasks' ? (
          <div className="space-y-6">
            <form
              onSubmit={addTask}
              className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {t(lang, 'taskTitle')}
                </label>
                <input
                  value={tTitle}
                  onChange={(e) => setTTitle(e.target.value)}
                  className={INPUT_CLASS}
                  required
                  disabled={taskBusy}
                />
              </div>
              <div className="w-full sm:w-48">
                <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {lang === 'ru' ? 'Тип' : 'Type'}
                </label>
                <select
                  value={tKind}
                  onChange={(e) => setTKind(e.target.value)}
                  className={INPUT_CLASS}
                  disabled={taskBusy}
                >
                  <option value="irrigation">{t(lang, 'irrigation')}</option>
                  <option value="feeding">{t(lang, 'feeding')}</option>
                  <option value="other">{t(lang, 'other')}</option>
                </select>
              </div>
              <button type="submit" disabled={taskBusy} className={BTN_PRIMARY}>
                {taskBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t(lang, 'addTask')}
              </button>
            </form>
            <ul className="space-y-2">
              {tasks.map((tk) => (
                <li
                  key={tk.id}
                  className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">{tk.title}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {kindLabel(lang, tk.kind)} · {tk.status}
                      {tk.due_at ? ` · ${formatFarmDateTime(tk.due_at, lang)}` : ''}
                    </p>
                  </div>
                  {tk.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => void completeTask(tk.id)}
                      disabled={completeTaskId !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {completeTaskId === tk.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {t(lang, 'done')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === 'team' ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-stone-900">{t(lang, 'teamSectionTitle')}</h3>
              {teamErr ? (
                <p className="mt-2 text-sm text-red-600">{teamErr}</p>
              ) : null}
              {teamMembersLoading ? (
                <div className="mt-6 flex flex-col items-center justify-center gap-2 py-10 text-stone-500">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-600" aria-hidden />
                  <span className="text-sm font-medium">{t(lang, 'loading')}</span>
                </div>
              ) : (
                <ul className="mt-4 space-y-2">
                  {members.map((m) => (
                    <li
                      key={m.user_id}
                      className="flex flex-col gap-1 rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-stone-900">{m.email}</span>
                        <span className="mt-0.5 block text-sm text-stone-600">
                          {memberRoleLabel(lang, m.role)}
                        </span>
                      </div>
                      {canProvisionTeam && m.role !== 'owner' ? (
                        <button
                          type="button"
                          onClick={() => void removeTeamMember(m.user_id, m.email)}
                          disabled={deletingMemberUserId === m.user_id}
                          className={BTN_DANGER}
                        >
                          {deletingMemberUserId === m.user_id ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          {lang === 'ru' ? 'Удалить' : 'Remove'}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {canProvisionTeam ? (
              <form
                onSubmit={addTeamMember}
                className="space-y-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-6 shadow-sm"
              >
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">
                    {t(lang, 'teamProvisionTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">{t(lang, 'teamProvisionHint')}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'firstName')}
                    </label>
                    <input
                      value={pFirstName}
                      onChange={(e) => setPFirstName(e.target.value)}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'lastName')}
                    </label>
                    <input
                      value={pLastName}
                      onChange={(e) => setPLastName(e.target.value)}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'email')}
                    </label>
                    <input
                      type="email"
                      autoComplete="email"
                      value={pEmail}
                      onChange={(e) => setPEmail(e.target.value)}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'phone')} ({t(lang, 'optionalShort')})
                    </label>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={pPhone}
                      onChange={(e) => setPPhone(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'nicheField')} ({t(lang, 'optionalShort')})
                    </label>
                    <input
                      value={pNiche}
                      onChange={(e) => setPNiche(e.target.value)}
                      className={INPUT_CLASS}
                      placeholder={lang === 'ru' ? 'Напр. полевые работы' : 'e.g. field ops'}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'password')}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={pPassword}
                      onChange={(e) => setPPassword(e.target.value)}
                      className={INPUT_CLASS}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'passwordConfirm')}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={pPassword2}
                      onChange={(e) => setPPassword2(e.target.value)}
                      className={INPUT_CLASS}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t(lang, 'memberRole')}
                    </label>
                    <select
                      value={pRole}
                      onChange={(e) => setPRole(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="manager">{t(lang, 'roleManager')}</option>
                      <option value="viewer">{t(lang, 'roleViewer')}</option>
                      <option value="agronomist">{t(lang, 'roleAgronomist')}</option>
                      <option value="livestock">{t(lang, 'roleLivestock')}</option>
                      <option value="field_worker">{t(lang, 'roleFieldWorker')}</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={teamBusy} className={BTN_PRIMARY}>
                  {teamBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      {t(lang, 'loading')}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      {t(lang, 'btnCreateMember')}
                    </>
                  )}
                </button>
              </form>
            ) : (
              <p className="text-sm text-stone-500">
                {lang === 'ru'
                  ? 'Создавать учётные записи могут владелец или менеджер. Обратитесь к ним или попросите приглашение по email, если аккаунт уже есть.'
                  : 'Only the farm owner or manager can create new staff accounts. Ask them, or use an email invite if you already have an account.'}
              </p>
            )}
          </div>
        ) : null}

        {tab === 'agent' ? (
          <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-lg shadow-emerald-900/5 md:flex-row">
            <div className="flex h-28 shrink-0 flex-col items-center justify-center gap-1 border-b border-emerald-100 bg-gradient-to-r from-emerald-100/90 to-emerald-50/80 px-3 md:hidden">
              <Bot className="h-10 w-10 text-emerald-500" />
              <p className="text-center text-[10px] font-medium leading-snug text-emerald-900">{t(lang, 'agentAsideShort')}</p>
            </div>
            <div className="hidden w-[180px] shrink-0 flex-col items-center justify-center gap-2 border-b border-emerald-100 bg-gradient-to-b from-emerald-100/90 to-emerald-50/80 px-2 py-4 md:flex md:min-h-[200px] md:border-b-0 md:border-r">
              <Bot className="h-12 w-12 text-emerald-500" />
              <p className="text-center text-[10px] font-medium leading-snug text-emerald-900">{t(lang, 'agentAsideShort')}</p>
              <p className="mt-auto border-t border-emerald-100 pt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                {lang === 'ru' ? 'ИИ онлайн' : 'AI online'}
              </p>
            </div>
            <div className="flex min-h-[480px] min-w-0 flex-1 flex-col">
            <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-4 text-white sm:px-5">
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 shrink-0 opacity-95" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/90">
                    {t(lang, 'agentPrimary')}
                  </p>
                  <p className="text-lg font-bold">{t(lang, 'agent')}</p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/95">{t(lang, 'agentPanelLead')}</p>
            </div>
            <div className="fx-scroll-area flex flex-1 flex-col gap-2 overflow-y-auto bg-stone-50/50 p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`w-fit max-w-[min(96%,56rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    m.role === 'user'
                      ? 'ml-auto max-w-[min(86%,32rem)] bg-emerald-600 text-white'
                      : 'mr-auto border border-stone-200 bg-white text-stone-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-stone-200 bg-white p-3 sm:p-4">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void sendChat()}
                placeholder={t(lang, 'chatPlaceholder')}
                className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                disabled={chatBusy}
              />
              <button
                type="button"
                onClick={() => void sendChat()}
                disabled={chatBusy}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {chatBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : null}
                {t(lang, 'send')}
              </button>
            </div>
            </div>
          </div>
        ) : null}
      </div>
        </>
      )}

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? 'error'}
        onClose={() => setToast(null)}
      />
    </div>
  )
}
