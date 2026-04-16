/**
 * Пороги и нормализация типов датчиков — по мотивам
 * github.com/Bekk-cap1/farm-database (src/utils/iotUtils.js).
 * Шкала влажности в farm-platform: soil_moisture_0_5 (0…5), что соответствует 0…100 %.
 */

export const MOISTURE_SCALE_MAX = 5

/** Пороги из референса в процентах влажности почвы; перевод на шкалу 0–5: pct/100*5 */
export const SOIL_PCT = {
  alarmMin: 18,
  warningMin: 22,
  warningMax: 70,
  alarmMax: 85,
} as const

export function moisture01ToPct(m: number): number {
  return Math.min(100, Math.round((m / MOISTURE_SCALE_MAX) * 100))
}

export function pctToMoisture01(pct: number): number {
  return (pct / 100) * MOISTURE_SCALE_MAX
}

const alarmDry = pctToMoisture01(SOIL_PCT.alarmMin)
const warnDry = pctToMoisture01(SOIL_PCT.warningMin)
const warnWet = pctToMoisture01(SOIL_PCT.warningMax)
const alarmWet = pctToMoisture01(SOIL_PCT.alarmMax)

export type SoilMoistureLevel = 'good' | 'warn_low' | 'alarm_low' | 'warn_high' | 'alarm_high'

export function classifySoilMoisture01(avg: number): SoilMoistureLevel {
  if (avg <= alarmDry) return 'alarm_low'
  if (avg < warnDry) return 'warn_low'
  if (avg >= alarmWet) return 'alarm_high'
  if (avg > warnWet) return 'warn_high'
  return 'good'
}

/** Для бейджа «Тревога» на карточке влажности — только критические зоны (как в референсе по %). */
export function soilMoistureAlarm01(avg: number): boolean {
  const c = classifySoilMoisture01(avg)
  return c === 'alarm_low' || c === 'alarm_high'
}

/** Температура воздуха: github.com/Bekk-cap1/farm-database — warning ниже 5°C, тревога при ≤0°C. */
export function airTempAlarm(airC: number | null): boolean {
  if (airC == null || Number.isNaN(airC)) return false
  return airC <= 0 || airC >= 40
}
