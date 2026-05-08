import { Download, Puzzle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'
import { t } from '../i18n/strings'

const MODAL_SEEN_KEY = 'farm_ext_banner_v2_seen'
const EXTENSION_ZIP_URL = '/farm-platform-tools-extension.zip'
const INSTALL_STEPS = [
  'extInstallStep1',
  'extInstallStep2',
  'extInstallStep3',
  'extInstallStep4',
  'extInstallStep5',
] as const

export function ExtensionBanner() {
  const { lang } = useLang()
  const [show, setShow] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    // Fast path: attribute already set by content script
    if (document.documentElement.hasAttribute('data-farm-ext-installed')) return

    let detected = false

    function onPong(e: MessageEvent) {
      if (e.source === window && (e.data as { type?: string })?.type === 'FARM_EXT_PONG') {
        detected = true
      }
    }
    window.addEventListener('message', onPong)
    window.postMessage({ type: 'FARM_EXT_PING' }, '*')

    const timer = setTimeout(() => {
      window.removeEventListener('message', onPong)
      const installed =
        detected || document.documentElement.hasAttribute('data-farm-ext-installed')
      if (!installed) {
        setShow(true)
        if (!sessionStorage.getItem(MODAL_SEEN_KEY)) {
          sessionStorage.setItem(MODAL_SEEN_KEY, '1')
          setModalOpen(true)
        }
      }
    }, 1800)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('message', onPong)
    }
  }, [])

  function closeModal() {
    setModalOpen(false)
  }

  if (!show) return null

  return (
    <>
      {!modalOpen && (
        <div className="fixed bottom-4 right-4 z-[90] w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Puzzle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900">{t(lang, 'extInstallTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">{t(lang, 'extBannerSub')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {t(lang, 'extBannerInstall')}
                </button>
                <a
                  href={EXTENSION_ZIP_URL}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t(lang, 'extInstallDownloadShort')}
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              aria-label={t(lang, 'cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Puzzle className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-stone-900">{t(lang, 'extInstallTitle')}</h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
                aria-label={t(lang, 'cancel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <p className="mb-4 text-sm text-stone-500">{t(lang, 'extInstallLead')}</p>

              <a
                href={EXTENSION_ZIP_URL}
                download
                className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                <Download className="h-4 w-4" />
                {t(lang, 'extInstallDownload')}
              </a>

              <ol className="space-y-3 text-sm text-stone-700">
                {INSTALL_STEPS.map((key, i) => (
                  <li key={key} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{t(lang, key)}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                {t(lang, 'extInstallNote')}
              </div>
            </div>

            <div className="flex gap-2 border-t border-stone-100 px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {t(lang, 'extInstallGotIt')}
              </button>
              <button
                type="button"
                onClick={closeModal}
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
