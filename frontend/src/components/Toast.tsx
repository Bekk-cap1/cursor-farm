type Props = {
  message: string | null
  variant?: 'error' | 'success'
  onClose: () => void
}

export function Toast({ message, variant = 'error', onClose }: Props) {
  if (!message) return null
  const bg =
    variant === 'error'
      ? 'border-red-200 bg-red-50 text-red-900 shadow-lg shadow-red-900/10'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-900/10'
  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur-md ${bg}`}
      role="status"
    >
      <p className="min-w-0 flex-1 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-lg px-2 py-0.5 font-semibold opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  )
}
