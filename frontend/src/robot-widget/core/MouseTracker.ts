import { Camera, Plane, Raycaster, Vector2, Vector3 } from 'three'

const _plane = new Plane(new Vector3(0, 1, 0), 0)
const _ray = new Raycaster()
const _ndc = new Vector2()
const _out = new Vector3()

/** Отступ от краёв окна (NDC), чтобы курсор у края всё ещё давал полноценный угол на полу */
const EDGE = 36

/**
 * Цель на полу y=0: и X, и Z из пересечения луча (полный курсор по экрану — в т.ч. «вверх/вниз» сайта).
 */
export class MouseTracker {
  target = new Vector3(0, 0, 0)
  /** NDC после clamp — для зрачков и наклона головы */
  ndcX = 0
  ndcY = 0

  private readonly canvas: HTMLCanvasElement
  private readonly camera: Camera

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas
    this.camera = camera
  }

  setFromClient(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const w = rect.width || 1
    const h = rect.height || 1
    let nx = ((clientX - rect.left) / w) * 2 - 1
    let ny = -((clientY - rect.top) / h) * 2 + 1

    const minX = (EDGE / w) * 2 - 1
    const maxX = ((w - EDGE) / w) * 2 - 1
    const minY = -((h - EDGE) / h) * 2 + 1
    const maxY = -((EDGE / h) * 2 - 1)
    nx = Math.min(maxX, Math.max(minX, nx))
    ny = Math.min(maxY, Math.max(minY, ny))

    this.ndcX = nx
    this.ndcY = ny

    _ndc.set(nx, ny)
    _ray.setFromCamera(_ndc, this.camera)
    if (_ray.ray.intersectPlane(_plane, _out)) {
      this.target.x = _out.x
      this.target.y = 0
      this.target.z = _out.z
    }
  }

  /** Пересечение луча из пикселя с полом y=0 без clamp по краям (для драга). */
  groundXZFromClient(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    const w = rect.width || 1
    const h = rect.height || 1
    const nx = ((clientX - rect.left) / w) * 2 - 1
    const ny = -((clientY - rect.top) / h) * 2 + 1
    _ndc.set(nx, ny)
    _ray.setFromCamera(_ndc, this.camera)
    if (_ray.ray.intersectPlane(_plane, _out)) {
      return { x: _out.x, z: _out.z }
    }
    return null
  }
}
