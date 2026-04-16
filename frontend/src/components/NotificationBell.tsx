import { Bell, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lang } from '../i18n/strings'
import * as api from '../lib/api'
import { t } from '../i18n/strings'

type Props = {
  lang: Lang
  variant: 'mobile' | 'desktop'
}

export function NotificationBell({ lang, variant }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<api.AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const pull = useCallback(async () => {
    setLoading(true)
    try {
      await api.syncNotifications()
      setItems(await api.fetchNotifications(25))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void pull()
  }, [pull])

  useEffect(() => {
    const onRefresh = () => {
      void pull()
    }
    window.addEventListener('notifications-refresh', onRefresh)
    return () => window.removeEventListener('notifications-refresh', onRefresh)
  }, [pull])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  const btnClass =
    variant === 'mobile'
      ? 'relative rounded-xl border border-stone-200/90 bg-white p-2 text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40'
      : 'relative rounded-xl border border-stone-200/90 bg-white p-2.5 text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40'

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className={btnClass}
        aria-label={t(lang, 'notifications')}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void pull()
        }}
      >
        <Bell className="h-5 w-5" strokeWidth={2} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={`fx-notify-panel absolute z-50 w-[min(100vw-2rem,22rem)] rounded-2xl border shadow-2xl ${
            variant === 'mobile' ? 'right-0 top-full mt-2' : 'right-0 top-full mt-2'
          }`}
        >
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="text-sm font-semibold text-stone-900">{t(lang, 'notifications')}</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => void pull()}
              className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
            >
              {t(lang, 'refreshNotifications')}
            </button>
          </div>
          <ul className="fx-scroll-area max-h-[min(70vh,20rem)] overflow-y-auto px-2 py-2">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-stone-500">
                {loading ? (
                  <span className="inline-flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" aria-hidden />
                    <span>{t(lang, 'loading')}</span>
                  </span>
                ) : lang === 'ru' ? (
                  'Пока нет уведомлений'
                ) : (
                  'No notifications yet'
                )}
              </li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  className={`mb-1 rounded-xl border px-3 py-2.5 text-sm ${
                    n.read_at
                      ? 'border-stone-100 bg-stone-50/80'
                      : 'border-amber-100 bg-amber-50/50'
                  }`}
                >
                  <p className="font-semibold text-stone-900">{n.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">{n.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!n.read_at ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                        onClick={async () => {
                          try {
                            await api.markNotificationRead(n.id)
                            setItems(await api.fetchNotifications(25))
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        {lang === 'ru' ? 'Прочитано' : 'Mark read'}
                      </button>
                    ) : null}
                    {n.farm_id != null ? (
                      <Link
                        to={`/farm/${n.farm_id}`}
                        className="text-xs font-semibold text-stone-600 hover:text-emerald-800"
                        onClick={() => setOpen(false)}
                      >
                        {t(lang, 'openFarm')} →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-stone-100 px-4 py-2">
            <Link
              to="/"
              className="block text-center text-xs font-semibold text-emerald-800 hover:underline"
              onClick={() => setOpen(false)}
            >
              {lang === 'ru' ? 'Открыть дашборд' : 'Open dashboard'}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
