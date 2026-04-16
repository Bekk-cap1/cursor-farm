import { ClipboardPlus, Database, Droplets, Sparkles } from 'lucide-react'
import type { Lang } from '../../i18n/strings'
import { t } from '../../i18n/strings'
import type { ActivitySuggestion, DashboardAnalyze, StressSignal } from '../../lib/api'

type ScoreRow = { k: string; v: string; title: string }

function stressSignalCodeLabel(lang: Lang, code: StressSignal['code']): string {
  if (code === 'drought_risk') return t(lang, 'stressCodeDrought')
  if (code === 'overwater_risk') return t(lang, 'stressCodeOverwater')
  if (code === 'patchy_moisture') return t(lang, 'stressCodePatchy')
  return t(lang, 'stressCodeBalanced')
}

type Props = {
  lang: Lang
  aiScoreRows: ScoreRow[]
  analytics: DashboardAnalyze | null
  summaryFallback: {
    overdue_total: number
    today_tasks_total: number
    zones_total: number
    herds_total: number
    farms_count: number
  } | null
  analyzeBusy: boolean
  lastAnalyzedAt: number | null
  onAnalyze: () => void
  recLabel: (id: string) => string
  recPriorityClass: (p: string) => string
  recommendationRows: { id: string; priority: 'high' | 'medium' | 'low' }[]
  insightInfoFallback?: string
  /** Подсказка, если ещё не было narrative (например на странице фермы). */
  emptyNarrativeHint?: string | null
  /** Пояснение индексов по данным (farm-database–style breakdown). */
  indicesBreakdownLines?: string[]
  /** Дашборд: загрузить демо-набор для аналитики. */
  onLoadDemoData?: () => void
  loadDemoDataBusy?: boolean
  loadDemoDataLabel?: string
  /** Создать задачу по предложению аналитики (активность). */
  onCreateActivity?: (s: ActivitySuggestion) => void | Promise<void>
  creatingActivityKey?: string | null
  createdActivityKeys?: readonly string[]
  /**
   * full — заголовок + подзаголовок внутри карточки (дашборд / страница фермы).
   * toolbar — только действия и подсказка API (страница «AI аналитик», где заголовок уже снаружи).
   */
  headerVariant?: 'full' | 'toolbar'
}

export function AiAnalyticsSection({
  lang,
  aiScoreRows,
  analytics,
  summaryFallback,
  analyzeBusy,
  lastAnalyzedAt,
  onAnalyze,
  recLabel,
  recPriorityClass,
  recommendationRows,
  insightInfoFallback,
  emptyNarrativeHint,
  indicesBreakdownLines,
  onLoadDemoData,
  loadDemoDataBusy,
  loadDemoDataLabel,
  onCreateActivity,
  creatingActivityKey,
  createdActivityKeys,
  headerVariant = 'full',
}: Props) {
  const createdSet = new Set(createdActivityKeys ?? [])

  const criticalVisible =
    Boolean(analytics?.insight_critical) ||
    (!analytics && summaryFallback && summaryFallback.overdue_total > 0)
  const warningVisible =
    Boolean(analytics?.insight_warning) ||
    (!analytics && summaryFallback && summaryFallback.today_tasks_total > 0)

  return (
    <section
      className={`border border-stone-200/80 bg-white shadow-sm ${
        headerVariant === 'toolbar' ? 'rounded-3xl p-6' : 'rounded-2xl p-5'
      }`}
    >
      {headerVariant === 'toolbar' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[10px] leading-relaxed text-emerald-800/90">{t(lang, 'backendAnalyzeApiHint')}</p>
            {lastAnalyzedAt ? (
              <span className="block text-[10px] text-stone-400">
                {lang === 'ru' ? 'Обновлено: ' : 'Updated: '}
                {new Date(lastAnalyzedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
            <div className="flex flex-wrap justify-end gap-2">
              {onLoadDemoData ? (
                <button
                  type="button"
                  disabled={Boolean(loadDemoDataBusy || analyzeBusy)}
                  onClick={onLoadDemoData}
                  title={loadDemoDataLabel}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  {loadDemoDataBusy ? '…' : loadDemoDataLabel ?? 'Demo'}
                </button>
              ) : null}
              <button
                type="button"
                disabled={analyzeBusy}
                onClick={onAnalyze}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {analyzeBusy ? '…' : t(lang, 'btnAnalyze')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900">{t(lang, 'aiAnalytics')}</h2>
              <p className="text-xs text-stone-500">{t(lang, 'aiAnalyticsLead')}</p>
              <p className="mt-0.5 text-[10px] text-emerald-700/90">{t(lang, 'backendAnalyzeApiHint')}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-2">
              {onLoadDemoData ? (
                <button
                  type="button"
                  disabled={Boolean(loadDemoDataBusy || analyzeBusy)}
                  onClick={onLoadDemoData}
                  title={loadDemoDataLabel}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  {loadDemoDataBusy ? '…' : loadDemoDataLabel ?? 'Demo'}
                </button>
              ) : null}
              <button
                type="button"
                disabled={analyzeBusy}
                onClick={onAnalyze}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {analyzeBusy ? '…' : t(lang, 'btnAnalyze')}
              </button>
            </div>
            {lastAnalyzedAt ? (
              <span className="text-[10px] text-stone-400">
                {lang === 'ru' ? 'Обновлено: ' : 'Updated: '}
                {new Date(lastAnalyzedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}
              </span>
            ) : null}
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {aiScoreRows.map((row) => (
          <div
            key={row.k}
            title={row.title}
            className="min-w-0 cursor-help rounded-lg border border-emerald-100 bg-emerald-50/80 px-2 py-2 text-center sm:px-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/80">
              {row.k}
            </p>
            <p className="text-sm font-bold text-emerald-950">{row.v}</p>
          </div>
        ))}
      </div>
      {analytics?.scan_caption ? (
        <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900/90">
          {analytics.scan_caption}
        </p>
      ) : null}
      {analytics?.stress_signals && analytics.stress_signals.length > 0 ? (
        <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <Droplets className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                {t(lang, 'stressSignalsTitle')}
              </p>
              <ul className="mt-2 space-y-2">
                {analytics.stress_signals.map((s, i) => {
                  const sevBorder =
                    s.severity === 'critical'
                      ? 'border-red-200 bg-red-50/50'
                      : s.severity === 'warning'
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-sky-200 bg-sky-50/40'
                  return (
                    <li
                      key={`${s.code}-${i}`}
                      className={`rounded-lg border px-3 py-2 text-xs text-stone-800 ${sevBorder}`}
                    >
                      <span className="font-semibold text-stone-900">
                        {stressSignalCodeLabel(lang, s.code)}
                      </span>
                      <span className="mx-1.5 text-stone-400">·</span>
                      <span className="text-stone-700">{s.message}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-emerald-900/70">
                {t(lang, 'stressSignalsFootnote')}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {analytics?.activity_suggestions && analytics.activity_suggestions.length > 0 ? (
        <ul className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {analytics.activity_suggestions.map((s) => {
            const border =
              s.severity === 'critical'
                ? 'border-red-200 bg-red-50/40'
                : s.severity === 'warning'
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-sky-200 bg-sky-50/60'
            const dot =
              s.severity === 'critical'
                ? 'bg-red-500'
                : s.severity === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-sky-500'
            const busy = creatingActivityKey === s.key
            const done = createdSet.has(s.key)
            return (
              <li
                key={s.key}
                className={`flex h-full flex-col rounded-xl border px-3 py-3 text-sm ${border}`}
              >
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug text-stone-900">{s.title}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-stone-600">
                        {s.description}
                      </p>
                      <p className="mt-1.5 font-mono text-[10px] text-stone-400" title={s.farm_name}>
                        #{s.farm_id}
                      </p>
                    </div>
                  </div>
                  {onCreateActivity ? (
                    <button
                      type="button"
                      disabled={busy || done || analyzeBusy}
                      onClick={() => void onCreateActivity(s)}
                      className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <ClipboardPlus className="h-3.5 w-3.5" />
                      {done
                        ? lang === 'ru'
                          ? 'Активность создана'
                          : 'Activity created'
                        : t(lang, 'btnCreateActivity')}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {indicesBreakdownLines && indicesBreakdownLines.length > 0 ? (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-left">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-600">
            {lang === 'ru' ? 'Откуда берутся оценки' : 'How scores map to your data'}
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-stone-700">
            {indicesBreakdownLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analytics?.narrative ? (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-sm text-stone-800">
          <p className="text-xs font-bold uppercase text-emerald-900">{t(lang, 'aiNarrativeTitle')}</p>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-stone-700">
            {analytics.narrative}
          </p>
        </div>
      ) : emptyNarrativeHint ? (
        <p className="mt-4 text-xs text-stone-500">{emptyNarrativeHint}</p>
      ) : null}
      <div className="mt-4 space-y-3 text-sm">
        {criticalVisible || warningVisible ? (
          <div
            className={
              criticalVisible && warningVisible ? 'grid gap-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-3'
            }
          >
            {criticalVisible ? (
              <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3">
                <p className="text-xs font-bold uppercase text-red-800">{t(lang, 'insightCritical')}</p>
                <p className="mt-1 text-stone-800">
                  {analytics?.insight_critical ??
                    (lang === 'ru'
                      ? `Просроченных задач: ${summaryFallback?.overdue_total ?? 0}. Проверьте задачи и стадо.`
                      : `${summaryFallback?.overdue_total ?? 0} overdue task(s).`)}
                </p>
              </div>
            ) : null}
            {warningVisible ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
                <p className="text-xs font-bold uppercase text-amber-900">{t(lang, 'insightWarning')}</p>
                <p className="mt-1 text-stone-800">
                  {analytics?.insight_warning ??
                    (lang === 'ru'
                      ? `На сегодня запланировано задач: ${summaryFallback?.today_tasks_total ?? 0}.`
                      : `Tasks due today: ${summaryFallback?.today_tasks_total ?? 0}.`)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
          <p className="text-xs font-bold uppercase text-sky-900">{t(lang, 'insightInfo')}</p>
          <p className="mt-1 text-stone-700">
            {analytics?.insight_info ??
              insightInfoFallback ??
              (lang === 'ru'
                ? 'Аналитика считается на сервере (backend analyze API).'
                : 'Analytics are computed on the server (backend analyze API).')}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm">
        {recommendationRows.map((r) => (
          <li key={`${r.id}-${r.priority}`} className="flex items-center justify-between gap-2">
            <span>{recLabel(r.id)}</span>
            <span className={recPriorityClass(r.priority)}>
              {r.priority === 'high'
                ? t(lang, 'priorityHigh')
                : r.priority === 'medium'
                  ? t(lang, 'priorityMed')
                  : t(lang, 'priorityLow')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
