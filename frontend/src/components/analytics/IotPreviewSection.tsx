import { Cpu } from 'lucide-react'
import type { Lang } from '../../i18n/strings'
import { t } from '../../i18n/strings'
import type { IotSnapshot } from '../../lib/iotMetrics'

type Props = {
  lang: Lang
  snap: IotSnapshot
  weatherAvailable: boolean
  subtitle?: string
  busy: boolean
  onAddDevice: () => void
  onSyncReadings: () => void
}

export function IotPreviewSection({
  lang,
  snap,
  weatherAvailable,
  subtitle,
  busy,
  onAddDevice,
  onSyncReadings,
}: Props) {
  const demoLbl = lang === 'ru' ? 'ДЕМО' : 'DEMO'

  const rows = [
    {
      label: t(lang, 'metricAirTemp'),
      value: snap.airC != null ? `${Math.round(snap.airC)}°C` : '—',
      alarm: snap.alarms.air,
      demo: false,
    },
    {
      label: t(lang, 'metricSoilPh'),
      value: `${snap.ph.toFixed(1)} pH`,
      alarm: snap.alarms.ph,
      demo: snap.phDemo,
    },
    {
      label: t(lang, 'metricSoilTemp'),
      value: `${Math.round(snap.soilTempC)}°C`,
      alarm: snap.alarms.soilTemp,
      demo: snap.soilTempDemo,
    },
    {
      label: t(lang, 'metricAnimalHealth'),
      value: `${snap.animalPct}%`,
      alarm: snap.alarms.herdHealth,
      demo: false,
    },
    {
      label: t(lang, 'metricSoilMoisture'),
      value: `${snap.soilMoisturePct}%`,
      alarm: snap.alarms.soilMoisture,
      demo: false,
    },
    {
      label: t(lang, 'metricSoilEc'),
      value: `${snap.ec.toFixed(1)} dS/m`,
      alarm: snap.alarms.ec,
      demo: snap.ecDemo,
    },
    {
      label: t(lang, 'metricWeather'),
      value:
        weatherAvailable !== false && snap.airC != null ? `${Math.round(snap.airC)}°` : '—',
      alarm: snap.alarms.weather,
      demo: false,
    },
  ]

  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Cpu className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-stone-900">{t(lang, 'iotPreview')}</h2>
            <p className="text-xs text-stone-500">
              {subtitle ?? t(lang, 'iotZoneSensorHint')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onAddDevice()
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? '…' : t(lang, 'btnAddDevice')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSyncReadings()
            }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {busy ? '…' : t(lang, 'btnAddReadings')}
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-stone-100 bg-[#fafafa] px-3 py-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-[11px] font-medium leading-tight text-stone-500">{m.label}</span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {m.demo ? (
                  <span className="rounded bg-stone-200/90 px-1 py-0.5 text-[8px] font-bold uppercase text-stone-700">
                    {demoLbl}
                  </span>
                ) : null}
                {m.alarm ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700">
                    {t(lang, 'alarmShort')}
                  </span>
                ) : null}
              </span>
            </div>
            <p className="mt-2 text-lg font-bold tabular-nums text-stone-900">{m.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
