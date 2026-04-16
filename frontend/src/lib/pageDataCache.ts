import type { Lang } from '../i18n/strings'
import type * as api from './api'

/** TTL по умолчанию: повторный заход на страницу без лишних запросов */
const DEFAULT_TTL_MS = 8 * 60 * 1000

type CacheEntry = { savedAt: number; payload: unknown }

const store = new Map<string, CacheEntry>()

function isFresh(entry: CacheEntry, ttlMs: number) {
  return Date.now() - entry.savedAt <= ttlMs
}

export function readCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const e = store.get(key)
  if (!e || !isFresh(e, ttlMs)) {
    if (e) store.delete(key)
    return null
  }
  return e.payload as T
}

export function writeCache(key: string, payload: unknown) {
  store.set(key, { savedAt: Date.now(), payload })
}

export function deleteCacheKey(key: string) {
  store.delete(key)
}

export function deleteCachePrefix(prefix: string) {
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

export function overviewCacheKey(lang: Lang) {
  return `overview:${lang}` as const
}

/** Общий пакет дашборда / ИИ-аналитики (без уведомлений — они подтягиваются отдельно) */
export type OverviewBundle = {
  summary: api.DashboardSummary
  farms: api.FarmSummary[]
  analytics: api.DashboardAnalyze | null
  lastAnalyzedAt: number | null
  iotCtx: {
    weather: Awaited<ReturnType<typeof api.fetchWeather>>
    zones: api.FieldZone[]
    herds: api.HerdGroup[]
    tasks: api.Task[]
  } | null
}

export function tryReadOverview(lang: Lang): OverviewBundle | null {
  return readCache<OverviewBundle>(overviewCacheKey(lang))
}

export function saveOverview(lang: Lang, bundle: OverviewBundle) {
  writeCache(overviewCacheKey(lang), bundle)
}

export function invalidateOverview() {
  deleteCachePrefix('overview:')
}

export function farmCoreKey(farmId: number, lang: Lang) {
  return `farmCore:${farmId}:${lang}` as const
}

export type FarmCoreSnapshot = {
  farm: api.Farm
  summary: Record<string, unknown>
  weather: Awaited<ReturnType<typeof api.fetchWeather>>
  zones: api.FieldZone[]
  herds: api.HerdGroup[]
  tasks: api.Task[]
  farmAnalytics: api.DashboardAnalyze | null
  lastAnalyzedAt: number | null
}

export function tryReadFarmCore(farmId: number, lang: Lang): FarmCoreSnapshot | null {
  return readCache<FarmCoreSnapshot>(farmCoreKey(farmId, lang))
}

export function saveFarmCore(farmId: number, lang: Lang, snap: FarmCoreSnapshot) {
  writeCache(farmCoreKey(farmId, lang), snap)
}

export function invalidateFarmCore(farmId: number) {
  deleteCachePrefix(`farmCore:${farmId}:`)
}
