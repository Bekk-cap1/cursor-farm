import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { type Lang } from '../i18n/strings'

const KEY = 'farm_lang'

type LangCtx = { lang: Lang; setLang: (l: Lang) => void }

const Ctx = createContext<LangCtx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const s = localStorage.getItem(KEY) as Lang | null
    return s === 'en' ? 'en' : 'ru'
  })

  useEffect(() => {
    localStorage.setItem(KEY, lang)
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)

  const value = useMemo(() => ({ lang, setLang }), [lang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLang outside LangProvider')
  return v
}
