import { AlertTriangle, FileDown, FileSpreadsheet, Info } from 'lucide-react'
import type { Lang } from '../i18n/strings'
import { t } from '../i18n/strings'
import type * as api from '../lib/api'

interface Props {
  lang: Lang
  summary: api.DashboardSummary | null
  analytics: api.DashboardAnalyze | null
  farms: api.FarmSummary[]
  iotCtx: { zones: api.FieldZone[]; herds: api.HerdGroup[]; tasks: api.Task[] } | null
}

export function ExportPanel({ lang, summary, analytics, farms, iotCtx }: Props) {
  const zones = iotCtx?.zones ?? []
  const herds = iotCtx?.herds ?? []
  const tasks = iotCtx?.tasks ?? []
  const hasData = farms.length > 0

  function handleExportPdf() {
    const html = buildPdfHtml({ lang, summary, analytics, farms, zones, herds, tasks })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 600)
  }

  function handleExportExcel() {
    const html = buildExcelHtml({ lang, summary, analytics, farms, zones, herds, tasks })
    const bom = '﻿'
    const blob = new Blob([bom + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `farm-report-${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const aiHints: Array<{ kind: 'critical' | 'warning' | 'info'; text: string }> = []
  if (analytics?.insight_critical) aiHints.push({ kind: 'critical', text: analytics.insight_critical })
  if (analytics?.insight_warning) aiHints.push({ kind: 'warning', text: analytics.insight_warning })
  if (analytics?.insight_info) aiHints.push({ kind: 'info', text: analytics.insight_info })
  if (aiHints.length === 0 && analytics?.narrative) {
    const truncated = analytics.narrative.slice(0, 220)
    aiHints.push({ kind: 'info', text: truncated + (analytics.narrative.length > 220 ? '…' : '') })
  }

  const isRu = lang === 'ru'

  return (
    <div className="fx-panel space-y-5 rounded-3xl p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileDown className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-stone-900">{t(lang, 'exportTitle')}</h2>
          <p className="text-sm text-stone-500">{t(lang, 'exportLead')}</p>
        </div>
      </div>

      {aiHints.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            {t(lang, 'exportAiHints')}
          </p>
          {aiHints.map((h, i) => (
            <div
              key={i}
              className={`flex gap-2.5 rounded-xl px-3.5 py-2.5 text-sm ${
                h.kind === 'critical'
                  ? 'bg-red-50 text-red-800'
                  : h.kind === 'warning'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-blue-50 text-blue-800'
              }`}
            >
              {h.kind === 'info' ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{h.text}</span>
            </div>
          ))}
        </div>
      )}

      {hasData ? (
        <div className="rounded-2xl bg-stone-50 px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
            {t(lang, 'exportWillInclude')}
          </p>
          <ul className="space-y-1 text-sm text-stone-600">
            <li>
              &bull;{' '}
              {isRu
                ? `${farms.length} ферм${farms.length === 1 ? 'а' : farms.length < 5 ? 'ы' : ''}`
                : `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'}`}
            </li>
            {zones.length > 0 && (
              <li>
                &bull;{' '}
                {isRu
                  ? `${zones.length} пол${zones.length === 1 ? 'е' : 'ей'}`
                  : `${zones.length} ${zones.length === 1 ? 'field' : 'fields'}`}
              </li>
            )}
            {herds.length > 0 && (
              <li>
                &bull;{' '}
                {isRu
                  ? `${herds.length} групп стада`
                  : `${herds.length} herd ${herds.length === 1 ? 'group' : 'groups'}`}
              </li>
            )}
            {tasks.length > 0 && (
              <li>
                &bull;{' '}
                {isRu
                  ? `${tasks.length} задач`
                  : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
                {summary && summary.overdue_total > 0 && (
                  <span className="ml-1 text-red-600">
                    ({summary.overdue_total} {isRu ? 'просрочено' : 'overdue'})
                  </span>
                )}
              </li>
            )}
            {analytics && (
              <li>
                &bull; {isRu ? 'AI-аналитика и рекомендации' : 'AI analytics & recommendations'}
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
          {t(lang, 'exportNoData')}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportPdf}
          disabled={!hasData}
          className="fx-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          <FileDown className="h-4 w-4" />
          {t(lang, 'exportBtnPdf')}
        </button>
        <button
          onClick={handleExportExcel}
          disabled={!hasData}
          className="fx-btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {t(lang, 'exportBtnExcel')}
        </button>
      </div>
    </div>
  )
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

interface BuildArgs {
  lang: Lang
  summary: api.DashboardSummary | null
  analytics: api.DashboardAnalyze | null
  farms: api.FarmSummary[]
  zones: api.FieldZone[]
  herds: api.HerdGroup[]
  tasks: api.Task[]
}

function esc(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildPdfHtml({ lang, summary, analytics, farms, zones, herds, tasks }: BuildArgs): string {
  const isRu = lang === 'ru'
  const dateStr = new Date().toLocaleString(isRu ? 'ru-RU' : 'en-US')

  const aiBlock =
    analytics
      ? `<section>
          <h2>${isRu ? 'AI-аналитика' : 'AI Analytics'}</h2>
          ${analytics.narrative ? `<p class="narrative">${esc(analytics.narrative)}</p>` : ''}
          <table>
            <thead><tr>
              <th>${isRu ? 'Показатель' : 'Metric'}</th>
              <th>${isRu ? 'Значение' : 'Value'}</th>
            </tr></thead>
            <tbody>
              <tr><td>${isRu ? 'Сканов' : 'Scans'}</td><td>${analytics.scans}</td></tr>
              <tr><td>${isRu ? 'Качество данных' : 'Data quality'}</td><td>${analytics.data_quality.toFixed(2)}</td></tr>
              <tr><td>${isRu ? 'Состояние культур' : 'Crop condition'}</td><td>${analytics.crop_condition.toFixed(2)}</td></tr>
              <tr><td>${isRu ? 'Здоровье животных' : 'Animal health'}</td><td>${analytics.animal_health.toFixed(2)}</td></tr>
              <tr><td>${isRu ? 'Водоснабжение' : 'Water supply'}</td><td>${analytics.water_supply.toFixed(2)}</td></tr>
            </tbody>
          </table>
          ${
            analytics.insight_critical
              ? `<div class="alert critical"><strong>${isRu ? 'Критично:' : 'Critical:'}</strong> ${esc(analytics.insight_critical)}</div>`
              : ''
          }
          ${
            analytics.insight_warning
              ? `<div class="alert warning"><strong>${isRu ? 'Внимание:' : 'Warning:'}</strong> ${esc(analytics.insight_warning)}</div>`
              : ''
          }
          ${
            analytics.insight_info
              ? `<div class="alert info"><strong>${isRu ? 'Инфо:' : 'Info:'}</strong> ${esc(analytics.insight_info)}</div>`
              : ''
          }
          ${
            analytics.recommendations.length
              ? `<h3>${isRu ? 'Рекомендации' : 'Recommendations'}</h3>
                 <ul>${analytics.recommendations.map((r) => `<li>[${r.priority.toUpperCase()}] ${esc(r.id)}</li>`).join('')}</ul>`
              : ''
          }
        </section>`
      : ''

  const zonesBlock =
    zones.length
      ? `<section>
          <h2>${isRu ? 'Поля' : 'Fields'}</h2>
          <table>
            <thead><tr>
              <th>${isRu ? 'Название' : 'Name'}</th>
              <th>${isRu ? 'Культура' : 'Crop'}</th>
              <th>${isRu ? 'Площадь, га' : 'Area, ha'}</th>
              <th>${isRu ? 'Полив' : 'Irrigation'}</th>
              <th>${isRu ? 'Влажность' : 'Moisture'}</th>
            </tr></thead>
            <tbody>
              ${zones
                .map(
                  (z) =>
                    `<tr>
                      <td>${esc(z.name)}</td>
                      <td>${esc(z.crop_type)}</td>
                      <td>${z.area_ha ?? '—'}</td>
                      <td>${esc(z.irrigation_type)}</td>
                      <td>${z.soil_moisture_0_5 ?? '—'}</td>
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </section>`
      : ''

  const herdsBlock =
    herds.length
      ? `<section>
          <h2>${isRu ? 'Стада' : 'Herds'}</h2>
          <table>
            <thead><tr>
              <th>${isRu ? 'Название' : 'Name'}</th>
              <th>${isRu ? 'Вид' : 'Type'}</th>
              <th>${isRu ? 'Голов' : 'Head count'}</th>
              <th>${isRu ? 'Рацион' : 'Ration'}</th>
            </tr></thead>
            <tbody>
              ${herds
                .map(
                  (h) =>
                    `<tr>
                      <td>${esc(h.name)}</td>
                      <td>${esc(h.animal_type)}</td>
                      <td>${h.head_count}</td>
                      <td>${esc(h.feeding_notes)}</td>
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </section>`
      : ''

  const tasksBlock =
    tasks.length
      ? `<section>
          <h2>${isRu ? 'Задачи' : 'Tasks'}</h2>
          <table>
            <thead><tr>
              <th>${isRu ? 'Задача' : 'Title'}</th>
              <th>${isRu ? 'Тип' : 'Kind'}</th>
              <th>${isRu ? 'Статус' : 'Status'}</th>
              <th>${isRu ? 'Срок' : 'Due'}</th>
            </tr></thead>
            <tbody>
              ${tasks
                .map(
                  (tk) =>
                    `<tr class="${tk.status === 'overdue' ? 'row-overdue' : ''}">
                      <td>${esc(tk.title)}</td>
                      <td>${esc(tk.kind)}</td>
                      <td>${esc(tk.status)}</td>
                      <td>${tk.due_at ? new Date(tk.due_at).toLocaleDateString(isRu ? 'ru-RU' : 'en-US') : '—'}</td>
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </section>`
      : ''

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${isRu ? 'Отчёт фермы' : 'Farm Report'} — ${dateStr}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1c1917; padding: 24px 32px; }
  .report-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e7e5e4; }
  .report-icon { font-size: 32px; }
  h1 { font-size: 20px; font-weight: 700; }
  .meta { font-size: 11px; color: #78716c; margin-top: 2px; }
  section { margin-bottom: 28px; }
  h2 { font-size: 15px; font-weight: 700; margin-bottom: 10px; color: #292524; border-left: 3px solid #16a34a; padding-left: 8px; }
  h3 { font-size: 13px; font-weight: 600; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f5f5f4; text-align: left; padding: 6px 8px; font-weight: 600; border: 1px solid #d6d3d1; }
  td { padding: 5px 8px; border: 1px solid #e7e5e4; }
  tr:nth-child(even) td { background: #fafaf9; }
  .row-overdue td { color: #b91c1c; }
  .alert { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
  .alert.critical { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .alert.warning  { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .alert.info     { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  .narrative { font-size: 12px; color: #57534e; margin-bottom: 10px; line-height: 1.5; }
  ul { padding-left: 18px; font-size: 12px; }
  li { margin-bottom: 3px; }
  .summary-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .summary-card { background: #f5f5f4; border-radius: 8px; padding: 10px 16px; min-width: 100px; }
  .summary-card .label { font-size: 10px; color: #78716c; text-transform: uppercase; }
  .summary-card .value { font-size: 18px; font-weight: 700; color: #1c1917; }
  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e7e5e4; font-size: 10px; color: #a8a29e; }
  @media print {
    body { padding: 12px 16px; }
    .print-bar { display: none; }
  }
  .print-bar { margin-top: 24px; display: flex; gap: 10px; }
  .btn { padding: 8px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-print { background: #16a34a; color: #fff; }
  .btn-close  { background: #f5f5f4; color: #292524; }
</style>
</head>
<body>
  <div class="report-header">
    <div class="report-icon">🌱</div>
    <div>
      <h1>${isRu ? 'Отчёт фермы — Farm AI' : 'Farm Report — Farm AI'}</h1>
      <p class="meta">${isRu ? 'Сформировано' : 'Generated'}: ${dateStr}</p>
    </div>
  </div>

  ${
    summary
      ? `<div class="summary-grid">
          <div class="summary-card"><div class="label">${isRu ? 'Ферм' : 'Farms'}</div><div class="value">${summary.farms_count}</div></div>
          <div class="summary-card"><div class="label">${isRu ? 'Полей' : 'Fields'}</div><div class="value">${summary.zones_total}</div></div>
          <div class="summary-card"><div class="label">${isRu ? 'Стад' : 'Herds'}</div><div class="value">${summary.herds_total}</div></div>
          <div class="summary-card"><div class="label">${isRu ? 'Просрочено' : 'Overdue'}</div><div class="value" style="color:${summary.overdue_total > 0 ? '#dc2626' : 'inherit'}">${summary.overdue_total}</div></div>
          <div class="summary-card"><div class="label">${isRu ? 'Сегодня' : 'Today'}</div><div class="value">${summary.today_tasks_total}</div></div>
        </div>`
      : ''
  }

  ${aiBlock}
  ${zonesBlock}
  ${herdsBlock}
  ${tasksBlock}

  <div class="footer">
    Farm AI · cursor-farm-1.onrender.com &nbsp;|&nbsp;
    ${isRu ? 'Данные ориентировочные. Решения — с вашим агрономом/ветеринаром.' : 'Data is indicative. Decisions — with your agronomist/vet.'}
  </div>

  <div class="print-bar">
    <button class="btn btn-print" onclick="window.print()">🖨 ${isRu ? 'Печать / PDF' : 'Print / Save PDF'}</button>
    <button class="btn btn-close" onclick="window.close()">✕ ${isRu ? 'Закрыть' : 'Close'}</button>
  </div>
</body>
</html>`
}

// ─── Excel (HTML table) ───────────────────────────────────────────────────────

function buildExcelHtml({ lang, summary, analytics, farms, zones, herds, tasks }: BuildArgs): string {
  const isRu = lang === 'ru'
  const dateStr = new Date().toLocaleString(isRu ? 'ru-RU' : 'en-US')

  const th = (s: string) => `<th style="background:#f5f5f4;font-weight:bold;padding:6px 10px;border:1px solid #ccc;">${esc(s)}</th>`
  const td = (s: string | number | null | undefined) => `<td style="padding:5px 10px;border:1px solid #e0e0e0;">${esc(s)}</td>`

  const summarySheet = summary
    ? `<table>
        <tr>${th(isRu ? 'Показатель' : 'Metric')}${th(isRu ? 'Значение' : 'Value')}</tr>
        <tr>${td(isRu ? 'Ферм' : 'Farms')}${td(summary.farms_count)}</tr>
        <tr>${td(isRu ? 'Полей' : 'Fields')}${td(summary.zones_total)}</tr>
        <tr>${td(isRu ? 'Стад' : 'Herds')}${td(summary.herds_total)}</tr>
        <tr>${td(isRu ? 'Просрочено' : 'Overdue')}${td(summary.overdue_total)}</tr>
        <tr>${td(isRu ? 'Задач сегодня' : 'Today tasks')}${td(summary.today_tasks_total)}</tr>
        ${analytics
          ? `<tr>${td('')}${td('')}</tr>
             <tr>${th(isRu ? 'AI: качество данных' : 'AI: data quality')}${td(analytics.data_quality.toFixed(2))}</tr>
             <tr>${th(isRu ? 'AI: культуры' : 'AI: crops')}${td(analytics.crop_condition.toFixed(2))}</tr>
             <tr>${th(isRu ? 'AI: животные' : 'AI: animals')}${td(analytics.animal_health.toFixed(2))}</tr>
             <tr>${th(isRu ? 'AI: водоснабжение' : 'AI: water')}${td(analytics.water_supply.toFixed(2))}</tr>`
          : ''}
      </table>`
    : ''

  const farmsSheet = farms.length
    ? `<table>
        <tr>
          ${th(isRu ? 'ID' : 'ID')}
          ${th(isRu ? 'Название' : 'Name')}
          ${th(isRu ? 'Регион' : 'Region')}
          ${th(isRu ? 'Просрочено' : 'Overdue')}
          ${th(isRu ? 'Задач сегодня' : 'Today tasks')}
        </tr>
        ${farms.map((f) => `<tr>${td(f.id)}${td(f.name)}${td(f.region)}${td(f.alerts_count)}${td(f.today_tasks)}</tr>`).join('')}
      </table>`
    : ''

  const zonesSheet = zones.length
    ? `<table>
        <tr>
          ${th(isRu ? 'Название' : 'Name')}
          ${th(isRu ? 'Культура' : 'Crop')}
          ${th(isRu ? 'Площадь га' : 'Area ha')}
          ${th(isRu ? 'Полив' : 'Irrigation')}
          ${th(isRu ? 'Влажность 0-5' : 'Moisture 0-5')}
          ${th('pH')}
          ${th('EC')}
        </tr>
        ${zones
          .map(
            (z) =>
              `<tr>${td(z.name)}${td(z.crop_type)}${td(z.area_ha)}${td(z.irrigation_type)}${td(z.soil_moisture_0_5)}${td(z.soil_ph)}${td(z.soil_ec_ds_m)}</tr>`,
          )
          .join('')}
      </table>`
    : ''

  const herdsSheet = herds.length
    ? `<table>
        <tr>
          ${th(isRu ? 'Название' : 'Name')}
          ${th(isRu ? 'Вид' : 'Type')}
          ${th(isRu ? 'Голов' : 'Head count')}
          ${th(isRu ? 'Рацион' : 'Ration')}
        </tr>
        ${herds.map((h) => `<tr>${td(h.name)}${td(h.animal_type)}${td(h.head_count)}${td(h.feeding_notes)}</tr>`).join('')}
      </table>`
    : ''

  const tasksSheet = tasks.length
    ? `<table>
        <tr>
          ${th(isRu ? 'Задача' : 'Title')}
          ${th(isRu ? 'Тип' : 'Kind')}
          ${th(isRu ? 'Статус' : 'Status')}
          ${th(isRu ? 'Срок' : 'Due')}
          ${th(isRu ? 'Описание' : 'Description')}
        </tr>
        ${tasks
          .map(
            (tk) =>
              `<tr>${td(tk.title)}${td(tk.kind)}${td(tk.status)}${td(tk.due_at ? new Date(tk.due_at).toLocaleDateString(isRu ? 'ru-RU' : 'en-US') : '')}${td(tk.description)}</tr>`,
          )
          .join('')}
      </table>`
    : ''

  const section = (title: string, content: string) =>
    content
      ? `<tr><td colspan="10" style="padding:16px 0 6px;font-size:15px;font-weight:bold;color:#166534;">${title}</td></tr>
         <tr><td colspan="10">${content}</td></tr>
         <tr><td colspan="10">&nbsp;</td></tr>`
      : ''

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8" /></head>
<body>
<table>
  <tr><td colspan="10" style="font-size:18px;font-weight:bold;padding:8px 0;">🌱 Farm AI — ${isRu ? 'Отчёт' : 'Report'}</td></tr>
  <tr><td colspan="10" style="color:#78716c;font-size:11px;padding-bottom:16px;">${isRu ? 'Сформировано' : 'Generated'}: ${dateStr}</td></tr>
  ${section(isRu ? 'Сводка' : 'Summary', summarySheet)}
  ${section(isRu ? 'Фермы' : 'Farms', farmsSheet)}
  ${section(isRu ? 'Поля' : 'Fields', zonesSheet)}
  ${section(isRu ? 'Стада' : 'Herds', herdsSheet)}
  ${section(isRu ? 'Задачи' : 'Tasks', tasksSheet)}
</table>
</body>
</html>`
}
