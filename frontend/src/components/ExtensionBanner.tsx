import { Puzzle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'
import { t } from '../i18n/strings'

const DISMISSED_KEY = 'farm_ext_banner_v1_dismissed'

export function ExtensionBanner() {
  const { lang } = useLang()
  const [show, setShow] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return
    // Give content.js time to run and set the attribute, then show modal directly
    const timer = setTimeout(() => {
      const installed = document.documentElement.hasAttribute('data-farm-ext-installed')
      if (!installed) {
        setShow(true)
        setModalOpen(true)
      }
    }, 1800)
    return () => clearTimeout(timer)
  }, [])

  function dismiss(remember: boolean) {
    if (remember) localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
    setModalOpen(false)
  }

  if (!show) return null

  return (
    <>
      {/* Install instructions modal — opens automatically */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Puzzle className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-stone-900">{t(lang, 'extInstallTitle')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <p className="mb-4 text-sm text-stone-500">{t(lang, 'extInstallLead')}</p>

              <ol className="space-y-3 text-sm text-stone-700">
                {(['extInstallStep1', 'extInstallStep2', 'extInstallStep3', 'extInstallStep4'] as const).map(
                  (key, i) => (
                    <li key={key} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{t(lang, key)}</span>
                    </li>
                  ),
                )}
              </ol>

              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                {t(lang, 'extInstallNote')}
              </div>
            </div>

            <div className="flex gap-2 border-t border-stone-100 px-5 py-4">
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {t(lang, 'extInstallGotIt')}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
              >
                {t(lang, 'cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
