import { MathUtils, Vector3 } from 'three'
import { CHIBI_ROOT_FLOOR_Y } from './config'
import type { XZBounds } from './core/WanderController'

const _p = new Vector3()

/** Уровень груди для расчёта дистанции до камеры (параллакс масштаба). */
const DEPTH_SAMPLE_Y = CHIBI_ROOT_FLOOR_Y + 0.38

export type WalkDistanceRange = { minD: number; maxD: number }

/** min/max расстояния от камеры до углов прямоугольника ходьбы (точка на уровне «центра» фигуры). */
export function computeWalkDistanceRange(
  camPos: Vector3,
  bounds: XZBounds,
  heightY = DEPTH_SAMPLE_Y,
): WalkDistanceRange {
  const corners: [number, number][] = [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ]
  let minD = Infinity
  let maxD = 0
  for (const [x, z] of corners) {
    _p.set(x, heightY, z)
    const d = _p.distanceTo(camPos)
    minD = Math.min(minD, d)
    maxD = Math.max(maxD, d)
  }
  return { minD, maxD }
}

/**
 * t=0 у ближайшей к камере точки зоны → atClose; t=1 у дальней → atFar.
 */
export function scaleFactorForWalkPosition(
  x: number,
  z: number,
  camPos: Vector3,
  range: WalkDistanceRange,
  atClose: number,
  atFar: number,
  heightY = DEPTH_SAMPLE_Y,
): number {
  _p.set(x, heightY, z)
  const d = _p.distanceTo(camPos)
  const span = Math.max(1e-4, range.maxD - range.minD)
  const t = MathUtils.clamp((d - range.minD) / span, 0, 1)
  return MathUtils.lerp(atClose, atFar, t)
}
