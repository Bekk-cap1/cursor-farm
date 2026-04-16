/**
 * Нормализация статуса здоровья — по мотивам
 * github.com/Bekk-cap1/farm-database (src/utils/healthStatus.js).
 */

const normalizeMap: Record<string, 'good' | 'sick' | 'critical'> = {
  good: 'good',
  healthy: 'good',
  ok: 'good',
  normal: 'good',
  sick: 'sick',
  ill: 'sick',
  checkup: 'sick',
  warning: 'sick',
  critical: 'critical',
  severe: 'critical',
  emergency: 'critical',
}

export function normalizeHealthStatus(status: string | null | undefined): 'good' | 'sick' | 'critical' | string {
  const key = String(status ?? '')
    .trim()
    .toLowerCase()
  return normalizeMap[key] ?? key ?? 'good'
}
