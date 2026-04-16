/**
 * Текстовое «раскрытие» индексов аналитики по данным UI — идеи и структура
 * github.com/Bekk-cap1/farm-database (src/utils/aiEngine.js): DQI, сущности, влажность, просрочки.
 * Цифры на экране по-прежнему приходят с backend analyze API; блок поясняет логику в терминах данных.
 */

import type { FieldZone, HerdGroup, Task } from './api'
import type { Lang } from '../i18n/strings'
import { moisture01ToPct } from './iotThresholds'

export type AnalyticsBreakdownInput = {
  lang: Lang
  farmsCount: number
  zones: FieldZone[]
  herds: HerdGroup[]
  tasks: Task[]
  /** Средняя влажность 0–5 по зонам; null если нет данных */
  avgMoisture01: number | null
}

function avgMoistureFromZones(zones: FieldZone[]): number | null {
  const m = zones.map((z) => z.soil_moisture_0_5).filter((x): x is number => x != null && Number.isFinite(x))
  if (!m.length) return null
  return m.reduce((a, b) => a + b, 0) / m.length
}

export function buildAnalyticsBreakdownLines(input: AnalyticsBreakdownInput): string[] {
  const { lang, farmsCount, zones, herds, tasks } = input
  const avgM = input.avgMoisture01 ?? avgMoistureFromZones(zones)
  const zonesWithMoisture = zones.filter((z) => z.soil_moisture_0_5 != null).length
  const now = Date.now()
  const overdue = tasks.filter(
    (t) => t.status === 'pending' && t.due_at && new Date(t.due_at).getTime() < now,
  ).length
  const pending = tasks.filter((t) => t.status === 'pending').length

  if (lang === 'ru') {
    const lines: string[] = []
    lines.push(
      `Полнота данных: учитываются фермы (${farmsCount}), поля (${zones.length}), стада (${herds.length}), задачи в работе (${pending}).`,
    )
    lines.push(
      zones.length
        ? `Влажность почвы заполнена для ${zonesWithMoisture} из ${zones.length} зон — это повышает доверие к оценке полива и культур.`
        : 'Полей пока нет — оценки по влажности и культурам ограничены.',
    )
    if (avgM != null) {
      lines.push(
        `Средняя влажность по шкале 0–5: ${avgM.toFixed(2)} (~${moisture01ToPct(avgM)}%). Показатели «культуры» и «вода» на сервере завязаны на эту величину.`,
      )
    } else {
      lines.push('Средняя влажность не определена — для оценки полива добавьте показания по зонам.')
    }
    lines.push(
      overdue > 0
        ? `Просроченных задач: ${overdue} — индекс «животные/задачи» на сервере снижается при накоплении долга.`
        : 'Просроченных задач нет — это поддерживает оценку по стаду и операциям.',
    )
    return lines
  }

  const lines: string[] = []
  lines.push(
    `Data coverage: farms (${farmsCount}), fields (${zones.length}), herds (${herds.length}), pending tasks (${pending}).`,
  )
  lines.push(
    zones.length
      ? `Soil moisture is set for ${zonesWithMoisture} of ${zones.length} zones — better coverage improves crop/water scores.`
      : 'No field zones yet — crop and water scores are limited.',
  )
  if (avgM != null) {
    lines.push(
      `Average soil moisture (0–5 scale): ${avgM.toFixed(2)} (~${moisture01ToPct(avgM)}%). Server crop and water indices use this signal.`,
    )
  } else {
    lines.push('Average moisture is unknown — sync readings per zone to unlock irrigation signals.')
  }
  lines.push(
    overdue > 0
      ? `Overdue tasks: ${overdue} — the animal/ops score is penalized when work piles up.`
      : 'No overdue tasks — helps keep animal/operations scores healthy.',
  )
  return lines
}
