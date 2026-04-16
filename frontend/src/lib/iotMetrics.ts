import type { FieldZone, HerdGroup, Task } from './api'
import { airTempAlarm, soilMoistureAlarm01 } from './iotThresholds'

const VET_HERD_RE = /вет|ветерин|vet|скот|осмотр|корм/i

export function isTaskOverdue(t: Task, now = Date.now()): boolean {
  if (t.status !== 'pending' || !t.due_at) return false
  return new Date(t.due_at).getTime() < now
}

export type IotSnapshot = {
  airC: number | null
  soilMoisturePct: number
  avgMoisture01: number
  animalPct: number
  ph: number
  ec: number
  soilTempC: number
  phDemo: boolean
  ecDemo: boolean
  soilTempDemo: boolean
  alarms: {
    air: boolean
    herdHealth: boolean
    soilMoisture: boolean
    weather: boolean
    ph: boolean
    ec: boolean
    soilTemp: boolean
  }
}

function avgNum(zones: FieldZone[], pick: (z: FieldZone) => number | null | undefined): number | null {
  const vals = zones.map(pick).filter((x): x is number => x != null && Number.isFinite(x))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * Единая логика IoT для дашборда (первая ферма) и страницы фермы.
 * Тревога: воздух — заморозки/жара / полив просрочен / погода недоступна;
 * стадо — просрочено кормление или «вет» в названии задачи;
 * влажность — пороги как в farm-database (проценты → шкала 0–5); pH/EC — вне допустимого диапазона.
 */
export function computeIotSnapshot(
  weather: { raw?: Record<string, unknown>; available?: boolean } | null | undefined,
  zones: FieldZone[],
  herds: HerdGroup[],
  tasks: Task[] | null | undefined,
): IotSnapshot {
  const raw = (weather?.raw ?? {}) as { current?: { temperature_2m?: number } }
  const airC = raw.current?.temperature_2m ?? null
  const moistures = zones.map((z) => z.soil_moisture_0_5).filter((m): m is number => m != null)
  const avgM = moistures.length ? moistures.reduce((a, b) => a + b, 0) / moistures.length : 2.5
  const soilMoisturePct = Math.min(100, Math.round((avgM / 5) * 100))
  const herdHeads = herds.reduce((s, h) => s + (h.head_count || 0), 0)
  const animalPct = herds.length ? Math.min(100, Math.round(55 + Math.min(herdHeads, 40))) : 62

  const phAvg = avgNum(zones, (z) => z.soil_ph ?? null)
  const ecAvg = avgNum(zones, (z) => z.soil_ec_ds_m ?? null)
  const tempAvg = avgNum(zones, (z) => z.soil_temp_c ?? null)

  const phDemo = phAvg == null
  const ecDemo = ecAvg == null
  const soilTempDemo = tempAvg == null

  const ph = phAvg ?? 6.4
  const ec = ecAvg ?? 1.2
  const soilTempC = tempAvg ?? 8

  const list = tasks ?? []
  const overdue = list.filter(isTaskOverdue)
  const feedingOverdue = overdue.some((t) => t.kind === 'feeding')
  const irrigOverdue = overdue.some((t) => t.kind === 'irrigation')
  const vetHerdOverdue = overdue.some(
    (t) => t.kind === 'feeding' || VET_HERD_RE.test(t.title),
  )

  const weatherBad = weather?.available === false
  const airRisk = airTempAlarm(airC)

  const alarms = {
    air: weatherBad || airRisk || irrigOverdue,
    herdHealth: feedingOverdue || vetHerdOverdue,
    soilMoisture: soilMoistureAlarm01(avgM),
    weather: weatherBad,
    ph: !phDemo && (ph < 5.5 || ph > 8.2),
    ec: !ecDemo && (ec < 0.35 || ec > 3.8),
    soilTemp: !soilTempDemo && (soilTempC < 2 || soilTempC > 45),
  }

  return {
    airC,
    soilMoisturePct,
    avgMoisture01: avgM,
    animalPct,
    ph,
    ec,
    soilTempC,
    phDemo,
    ecDemo,
    soilTempDemo,
    alarms,
  }
}
