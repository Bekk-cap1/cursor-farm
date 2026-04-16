import { useMemo } from 'react'

export type VegPoint = { date: string; value: number }

type Props = {
  points: VegPoint[]
  className?: string
  width?: number
  height?: number
}

/** Minimal SVG sparkline for synthetic vegetation / NDVI proxy (0–1). */
export function VegetationSparkline({ points, className, width = 120, height = 36 }: Props) {
  const d = useMemo(() => {
    if (points.length < 2) return ''
    const vals = points.map((p) => p.value)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min || 1e-6
    const pad = 2
    const w = width - 2 * pad
    const h = height - 2 * pad
    return points
      .map((p, i) => {
        const x = pad + (i / (points.length - 1)) * w
        const y = pad + h - ((p.value - min) / span) * h
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [points, width, height])

  if (points.length < 2) return null

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-600"
      />
    </svg>
  )
}
