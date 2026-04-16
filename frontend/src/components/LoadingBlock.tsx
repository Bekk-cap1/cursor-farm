import { Loader2 } from 'lucide-react'
import type { Lang } from '../i18n/strings'
import { t } from '../i18n/strings'

type Props = {
  lang: Lang
  className?: string
  /** Меньше отступы для встраивания в карточку */
  compact?: boolean
}

export function LoadingBlock({ lang, className = '', compact }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-stone-500 ${compact ? 'py-10' : 'py-16'} ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 animate-spin text-emerald-600`}
        aria-hidden
      />
      <span className="text-sm font-medium">{t(lang, 'loading')}</span>
    </div>
  )
}
