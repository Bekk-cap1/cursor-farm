import { Camera, MathUtils, Plane, Raycaster, Vector2, Vector3 } from 'three'

const _ndcPick = new Vector2()
const _rayPick = new Raycaster()
const _hitPick = new Vector3()
const _planePick = new Plane(new Vector3(0, 1, 0), 0)

/** Случайная точка на полу, соответствующая позиции на экране (равномерно по окну). */
export function groundXZFromNDC(
  camera: Camera,
  nx: number,
  ny: number,
): { x: number; z: number } | null {
  _ndcPick.set(nx, ny)
  _rayPick.setFromCamera(_ndcPick, camera)
  if (_rayPick.ray.intersectPlane(_planePick, _hitPick)) {
    return { x: _hitPick.x, z: _hitPick.z }
  }
  return null
}

const _plane = new Plane(new Vector3(0, 1, 0), 0)
const _ray = new Raycaster()
const _ndc = new Vector2()
const _hit = new Vector3()

export type XZBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Отступ от краёв зоны ходьбы по одной оси. Раньше использовали max(span*0.1, 0.06):
 * при малом span по Z (типично на широком мониторе) получалось 2*pad > span → кламп
 * ломался и робот почти не менял глубину (на экране — «не ходит вверх-вниз»).
 */
function axisPadding(span: number, fraction = 0.1, minPad = 0.02): number {
  if (span <= 1e-6) return 0
  const raw = Math.max(span * fraction, minPad)
  const maxPad = span * 0.48
  return Math.min(raw, maxPad)
}

/**
 * Прямоугольник на плоскости y=0, в который попадают лучи из углов viewport
 * (с отступом) — робот может «гулять» и по горизонтали экрана, и по вертикали (глубина).
 */
export function worldXZBoundsFromCanvas(
  _canvas: HTMLCanvasElement,
  camera: Camera,
  ndcMargin = 0.03,
): XZBounds {
  const m = ndcMargin
  const corners: [number, number][] = [
    [-1 + m, 1 - m],
    [1 - m, 1 - m],
    [1 - m, -1 + m],
    [-1 + m, -1 + m],
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let any = false
  for (const [nx, ny] of corners) {
    _ndc.set(nx, ny)
    _ray.setFromCamera(_ndc, camera)
    if (_ray.ray.intersectPlane(_plane, _hit)) {
      any = true
      minX = Math.min(minX, _hit.x)
      maxX = Math.max(maxX, _hit.x)
      minZ = Math.min(minZ, _hit.z)
      maxZ = Math.max(maxZ, _hit.z)
    }
  }
  if (!any) return { minX: -2, maxX: 2, minZ: -1.2, maxZ: 1.2 }
  return { minX, maxX, minZ, maxZ }
}

/**
 * Самостоятельное блуждание по плоскости пола (X и Z) в пределах видимой области.
 */
export class WanderController {
  goalX = 0
  goalZ = 0
  pauseLeft = 0
  private minX = -2
  private maxX = 2
  private minZ = -1
  private maxZ = 1
  private readonly canvas: HTMLCanvasElement
  private readonly camera: Camera

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas
    this.camera = camera
  }

  setXZBounds(b: XZBounds) {
    this.minX = b.minX
    this.maxX = b.maxX
    this.minZ = b.minZ
    this.maxZ = b.maxZ
  }

  refreshRangeFromViewport() {
    this.setXZBounds(worldXZBoundsFromCanvas(this.canvas, this.camera))
  }

  getWalkBounds(): XZBounds {
    return { minX: this.minX, maxX: this.maxX, minZ: this.minZ, maxZ: this.maxZ }
  }

  /** Ограничить позицию той же «площадкой», что и для блуждания. */
  clampXZ(x: number, z: number): { x: number; z: number } {
    const spanX = this.maxX - this.minX
    const spanZ = this.maxZ - this.minZ
    const padX = axisPadding(spanX)
    const padZ = axisPadding(spanZ)
    return {
      x: MathUtils.clamp(x, this.minX + padX, this.maxX - padX),
      z: MathUtils.clamp(z, this.minZ + padZ, this.maxZ - padZ),
    }
  }

  pickGoal() {
    const margin = 0.08
    for (let i = 0; i < 10; i++) {
      let nx: number
      let ny: number
      if (i < 4) {
        // Явно верх / низ viewport — заметное перемещение по «высоте» страницы (ось Z на полу)
        ny = i % 2 === 0 ? -0.88 + Math.random() * 0.12 : 0.88 - Math.random() * 0.12
        nx = (Math.random() * 2 - 1) * (1 - margin)
      } else {
        nx = (Math.random() * 2 - 1) * (1 - margin)
        ny = (Math.random() * 2 - 1) * (1 - margin)
      }
      const p = groundXZFromNDC(this.camera, nx, ny)
      if (p) {
        const c = this.clampXZ(p.x, p.z)
        this.goalX = c.x
        this.goalZ = c.z
        return
      }
    }
    const spanX = this.maxX - this.minX
    const spanZ = this.maxZ - this.minZ
    const padX = axisPadding(spanX)
    const padZ = axisPadding(spanZ)
    const loX = this.minX + padX
    const hiX = this.maxX - padX
    const loZ = this.minZ + padZ
    const hiZ = this.maxZ - padZ
    const rangeX = Math.max(0, hiX - loX)
    const rangeZ = Math.max(0, hiZ - loZ)
    this.goalX = loX + Math.random() * Math.max(0.05, rangeX)
    this.goalZ = loZ + Math.random() * Math.max(0.05, rangeZ)
  }

  /** Цель в зоне экрана (NDC), например при смене страницы. */
  setGoalFromScreenNDC(nx: number, ny: number) {
    const p = groundXZFromNDC(this.camera, nx, ny)
    if (p) {
      const c = this.clampXZ(p.x, p.z)
      this.goalX = c.x
      this.goalZ = c.z
      this.pauseLeft = 0.12
    }
  }

  /** Первичная цель и границы. */
  bootstrap(currentX: number, currentZ: number) {
    this.refreshRangeFromViewport()
    this.pickGoal()
    let guard = 0
    while (Math.hypot(this.goalX - currentX, this.goalZ - currentZ) < 0.22 && guard++ < 10) {
      this.pickGoal()
    }
    this.pauseLeft = 0.4 + Math.random() * 0.6
  }

  update(dt: number, currentX: number, currentZ: number) {
    const arrived = Math.hypot(this.goalX - currentX, this.goalZ - currentZ) < 0.12
    if (arrived) {
      this.pauseLeft -= dt
      if (this.pauseLeft <= 0) {
        this.pickGoal()
        this.pauseLeft = 1.3 + Math.random() * 2.4
      }
    }
  }
}
