/** Плейсхолдер, пока грузится Three.js (ленивая загрузка). */
export function ThreeCanvasFallback({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[160px] w-full animate-pulse flex-col items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100/80 to-sky-100/55 text-xs font-medium text-stone-500">
      <span className="mb-1 h-10 w-10 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" />
      {label ?? '3D…'}
    </div>
  )
}
