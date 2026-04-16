const TOKEN_KEY = 'farm_token'

/** Пусто = тот же хост (nginx проксирует /api). Иначе полный origin бэкенда, без завершающего /. */
function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined
  const base = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  const p = path.startsWith('/') ? path : `/${path}`
  if (!base) return p
  return `${base}${p}`
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): HeadersInit {
  const t = getToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

async function parseError(r: Response): Promise<string> {
  try {
    const j = await r.json()
    if (j.detail) return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
  } catch {
    /* ignore */
  }
  return r.statusText || String(r.status)
}

export type FarmSummary = {
  id: number
  name: string
  region: string
  alerts_count: number
  today_tasks: number
  my_role?: string
  latitude?: number | null
  longitude?: number | null
}

export type DashboardSummary = {
  farms_count: number
  overdue_total: number
  today_tasks_total: number
  zones_total: number
  herds_total: number
  farms: { id: number; name: string; overdue: number; today: number }[]
  recent_tasks: {
    id: number
    farm_id: number
    title: string
    kind: string
    status: string
    due_at: string | null
  }[]
}

export type ActivitySuggestion = {
  key: string
  farm_id: number
  farm_name: string
  title: string
  kind: 'irrigation' | 'feeding' | 'other'
  description: string
  severity: 'critical' | 'warning' | 'info'
}

export type StressSignal = {
  code: 'drought_risk' | 'overwater_risk' | 'patchy_moisture' | 'balanced'
  severity: 'critical' | 'warning' | 'info'
  message: string
}

export type DashboardAnalyze = {
  scans: number
  data_quality: number
  crop_condition: number
  animal_health: number
  water_supply: number
  devices_total: number
  insight_critical: string | null
  insight_warning: string | null
  insight_info: string | null
  narrative: string
  recommendations: { id: string; priority: 'high' | 'medium' | 'low' }[]
  activity_suggestions: ActivitySuggestion[]
  scan_caption: string
  stress_signals: StressSignal[]
}

export type AppNotification = {
  id: number
  title: string
  body: string
  farm_id: number | null
  read_at: string | null
  created_at: string
}

export type Farm = {
  id: number
  name: string
  region: string
  latitude: number | null
  longitude: number | null
  timezone: string
}

export type FieldZone = {
  id: number
  farm_id: number
  name: string
  area_ha: number | null
  crop_type: string | null
  irrigation_type: string
  soil_moisture_0_5: number | null
  soil_ph?: number | null
  soil_ec_ds_m?: number | null
  soil_temp_c?: number | null
}

export type HerdGroup = {
  id: number
  farm_id: number
  name: string
  animal_type: string
  head_count: number
  feeding_notes: string | null
}

export type Task = {
  id: number
  farm_id: number
  title: string
  kind: string
  status: string
  due_at: string | null
  description: string | null
  source: string
}

/** Состояние ключа OpenAI и выбранного LLM (см. backend GET /api/health). */
export type HealthResponse = {
  status: string
  openai: 'configured' | 'missing' | 'invalid_key_format' | 'unused'
  llm: 'openai' | 'gemini' | 'off'
}

export async function fetchHealth(): Promise<HealthResponse> {
  const r = await fetch(apiUrl('/api/health'))
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<{ access_token: string }> {
  const r = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function registerRequest(
  email: string,
  password: string,
): Promise<{ access_token: string }> {
  const r = await fetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export type RegisterEmailSendPayload = {
  email: string
  password: string
  password_confirm: string
  first_name: string
  last_name: string
  niche?: string
  phone?: string
}

export async function registerEmailSend(
  body: RegisterEmailSendPayload,
): Promise<{ ok: boolean; detail: string; expires_in_minutes?: number; debug_code?: string | null }> {
  const r = await fetch(apiUrl('/api/auth/register/email-send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function registerEmailVerify(
  email: string,
  code: string,
): Promise<{ access_token: string }> {
  const r = await fetch(apiUrl('/api/auth/register/email-verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function registerSmsSend(
  email: string,
  password: string,
  phone: string,
): Promise<{ ok: boolean; detail: string; debug_code?: string | null }> {
  const r = await fetch(apiUrl('/api/auth/register/sms-send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, phone }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function registerSmsVerify(
  email: string,
  code: string,
): Promise<{ access_token: string }> {
  const r = await fetch(apiUrl('/api/auth/register/sms-verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchMe(): Promise<{
  id: number
  email: string
  phone?: string | null
  first_name?: string
  last_name?: string
  niche?: string | null
}> {
  const r = await fetch(apiUrl('/api/auth/me'), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export type FarmMember = {
  user_id: number
  email: string
  role: string
}

export async function fetchFarmMembers(farmId: number): Promise<FarmMember[]> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/members`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function provisionFarmMember(
  farmId: number,
  body: {
    email: string
    password: string
    password_confirm: string
    role: string
    first_name?: string
    last_name?: string
    phone?: string | null
    niche?: string | null
  },
): Promise<FarmMember> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/members/provision`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function removeFarmMember(farmId: number, memberUserId: number): Promise<void> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/members/${memberUserId}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
}

export async function fetchFarms(): Promise<FarmSummary[]> {
  const r = await fetch(apiUrl('/api/farms'), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const r = await fetch(apiUrl('/api/dashboard/summary'), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function postDashboardAnalyze(lang: 'ru' | 'en' = 'ru'): Promise<DashboardAnalyze> {
  const q = new URLSearchParams({ lang })
  const r = await fetch(apiUrl(`/api/dashboard/analyze?${q}`), {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export type DemoAiDataResult = {
  farm_id: number
  skipped: boolean
  zones_added: number
  herds_added: number
  tasks_added: number
}

/** Одноразовая загрузка демо-полей/стада/задач для наполнения AI-аналитики (как в seed). */
export async function postDashboardDemoAiData(farmId?: number): Promise<DemoAiDataResult> {
  const q = farmId != null ? `?farm_id=${encodeURIComponent(String(farmId))}` : ''
  const r = await fetch(apiUrl(`/api/dashboard/demo-ai-data${q}`), {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

/** Аналитика по одной ферме (те же поля, что у дашборда). */
export async function postFarmAnalyze(
  farmId: number,
  lang: 'ru' | 'en' = 'ru',
): Promise<DashboardAnalyze> {
  const q = new URLSearchParams({ lang })
  const r = await fetch(apiUrl(`/api/dashboard/analyze/farm/${farmId}?${q}`), {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function syncZoneReadings(farmId: number): Promise<FieldZone[]> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/zones/sync-readings`), {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const q = new URLSearchParams({ limit: String(limit) })
  const r = await fetch(apiUrl(`/api/notifications?${q}`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  const r = await fetch(apiUrl(`/api/notifications/${id}/read`), {
    method: 'PATCH',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function syncNotifications(): Promise<{ ok: boolean; overdue_total: number }> {
  const r = await fetch(apiUrl('/api/notifications/sync'), {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchFarm(farmId: number): Promise<Farm> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function createFarm(body: {
  name: string
  region?: string
  latitude?: number | null
  longitude?: number | null
}): Promise<Farm> {
  const r = await fetch(apiUrl('/api/farms'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchFarmSummary(farmId: number): Promise<Record<string, unknown>> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/summary`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchWeather(farmId: number): Promise<{
  latitude: number
  longitude: number
  summary_ru: string
  raw: Record<string, unknown>
  available?: boolean
}> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/weather`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function fetchZones(farmId: number): Promise<FieldZone[]> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/zones`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export type VegetationProxyPoint = { date: string; value: number }

export type ZoneVegetationSeries = {
  zone_id: number
  zone_name: string
  points: VegetationProxyPoint[]
  disclaimer: string
}

export type TelemetryPoint = {
  recorded_at: string
  value: number
  metric: string
  source: string
}

export type ZoneTelemetrySeries = {
  zone_id: number
  metric: string
  points: TelemetryPoint[]
  count: number
}

/** История показаний из БД (ТЗ: телеметрия по зоне). */
export async function fetchZoneTelemetry(
  farmId: number,
  zoneId: number,
  opts?: { metric?: string; days?: number },
): Promise<ZoneTelemetrySeries> {
  const q = new URLSearchParams()
  q.set('metric', opts?.metric ?? 'soil_moisture_0_5')
  if (opts?.days != null) q.set('days', String(opts.days))
  const r = await fetch(apiUrl(`/api/farms/${farmId}/zones/${zoneId}/telemetry?${q}`), {
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

/** Синтетический ряд «вегетации» (0–1) по дням для всех полей фермы; не Sentinel NDVI. */
export async function fetchVegetationProxySeries(
  farmId: number,
  opts?: { days?: number; lang?: 'ru' | 'en' },
): Promise<ZoneVegetationSeries[]> {
  const q = new URLSearchParams()
  if (opts?.days != null) q.set('days', String(opts.days))
  q.set('lang', opts?.lang ?? 'ru')
  const r = await fetch(apiUrl(`/api/farms/${farmId}/zones/vegetation-proxy-series?${q}`), {
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function createZone(
  farmId: number,
  body: {
    name: string
    area_ha?: number | null
    crop_type?: string | null
    irrigation_type?: string
    soil_moisture_0_5?: number | null
  },
): Promise<FieldZone> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/zones`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function deleteZone(farmId: number, zoneId: number) {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/zones/${zoneId}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
}

export async function fetchHerds(farmId: number): Promise<HerdGroup[]> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/herds`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function createHerd(
  farmId: number,
  body: {
    name: string
    animal_type?: string
    head_count?: number
    feeding_notes?: string | null
  },
): Promise<HerdGroup> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/herds`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function deleteHerd(farmId: number, herdId: number) {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/herds/${herdId}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(await parseError(r))
}

export async function fetchTasks(farmId: number): Promise<Task[]> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/tasks`), { headers: authHeaders() })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function createTask(
  farmId: number,
  body: {
    title: string
    kind?: string
    due_at?: string | null
    description?: string | null
  },
): Promise<Task> {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/tasks`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}

export async function patchTaskStatus(
  farmId: number,
  taskId: number,
  status: 'pending' | 'done' | 'cancelled',
) {
  const r = await fetch(apiUrl(`/api/farms/${farmId}/tasks/${taskId}`), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  })
  if (!r.ok) throw new Error(await parseError(r))
}

export async function postAgentChat(input: {
  farm_id: number | null
  messages: { role: 'user' | 'assistant'; content: string }[]
}): Promise<{ reply: string; farm_id: number | null }> {
  const r = await fetch(apiUrl('/api/agent/chat'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json()
}
