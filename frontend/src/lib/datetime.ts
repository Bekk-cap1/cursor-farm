import type { Lang } from '../i18n/strings'

/** ISO-строка с бэкенда → дата и время для человека (локаль RU/EN). */
export function formatFarmDateTime(
  value: string | null | undefined,
  lang: Lang,
): string {
  if (value == null || !String(value).trim()) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
