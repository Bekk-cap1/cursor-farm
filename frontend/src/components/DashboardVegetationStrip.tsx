import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lang } from '../i18n/strings'
import { t } from '../i18n/strings'
import * as api from '../lib/api'
import { LoadingBlock } from './LoadingBlock'
import { VegetationSparkline } from './VegetationSparkline'

const DAY_OPTIONS = [14, 30, 60, 90] as const

type Props = {
  lang: Lang
  farmId: number | null
  farmName: string | null
  /** Сигнатура зон (id + влажность), чтобы перезапросить после sync */
  zonesSig: string
}

export function DashboardVegetationStrip({ lang, farmId, farmName, zonesSig }: Props) {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30)
  const [series, setSeries] = useState<api.ZoneVegetationSeries[] | null>(null)

  useEffect(() => {
    if (farmId == null || !zonesSig) {
      setSeries(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await api.fetchVegetationProxySeries(farmId, { days, lang })
        if (!cancelled) setSeries(list)
      } catch {
        if (!cancelled) setSeries(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [farmId, zonesSig, days, lang])

  const disclaimer = series?.[0]?.disclaimer

  const zoneCount = useMemo(() => zonesSig.split('|').filter(Boolean).length, [zonesSig])

  if (farmId == null || zoneCount === 0) return null

  return (
    <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-emerald-950">{t(lang, 'dashVegTitle')}</h2>
          <p className="mt-0.5 text-xs text-emerald-900/80">
            {farmName
              ? lang === 'ru'
                ? `Первая ферма в списке: «${farmName}».`
                : `First farm in list: "${farmName}".`
              : t(lang, 'dashVegFirstFarmFallback')}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-emerald-900">
          <span>{t(lang, 'vegDaysLabel')}</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as (typeof DAY_OPTIONS)[number])}
            className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-stone-900 shadow-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {lang === 'ru' ? `${d} дн.` : `${d} d`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {disclaimer ? (
        <p className="mt-3 rounded-lg border border-emerald-100 bg-white/70 px-3 py-2 text-[11px] text-emerald-900/90">
          {disclaimer}
        </p>
      ) : null}
      {series === null ? (
        <LoadingBlock lang={lang} compact className="mt-3 min-h-[120px]" />
      ) : (
        <ul className="mt-4 flex flex-wrap gap-4">
          {series.map((s) => (
            <li
              key={s.zone_id}
              className="min-w-[140px] flex-1 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2 shadow-sm"
            >
              <p className="truncate text-xs font-semibold text-stone-800" title={s.zone_name}>
                {s.zone_name}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <VegetationSparkline points={s.points} width={100} height={32} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-right text-[11px]">
        <Link
          to={`/farm/${farmId}?tab=fields`}
          className="font-semibold text-emerald-800 underline-offset-2 hover:underline"
        >
          {t(lang, 'dashVegOpenFields')}
        </Link>
      </p>
    </section>
  )
}
