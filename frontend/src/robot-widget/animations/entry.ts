import gsap from 'gsap'
import { CHIBI_ROOT_DISPLAY_SCALE, CHIBI_ROOT_FLOOR_Y } from '../config'
import type { ChibiParts } from '../core/ChibiModel'

const S = CHIBI_ROOT_DISPLAY_SCALE

/**
 * Вход: быстрый выход из масштаба → сразу помахать рукой → лёгкий прыжок.
 */
export function createEntryTimeline(parts: ChibiParts, onComplete: () => void) {
  const { root, body, armR } = parts
  const tl = gsap.timeline({
    defaults: { overwrite: 'auto' as const },
    onComplete,
  })

  root.scale.set(0.04 * S, 0.04 * S, 0.04 * S)
  tl.to(root.scale, { x: S, y: S, z: S, duration: 0.26, ease: 'back.out(1.35)' })

  for (let w = 0; w < 3; w++) {
    tl.to(armR.rotation, { z: -1.05, duration: 0.16, ease: 'power2.inOut' })
      .to(armR.rotation, { z: 0.35, duration: 0.14, ease: 'power2.inOut' })
      .to(armR.rotation, { z: 0, duration: 0.14, ease: 'power2.out' })
  }

  tl.to(body.scale, { y: 0.88, x: 1.06, duration: 0.06, ease: 'power2.out' })
    .to(body.scale, { y: 1, x: 1, duration: 0.1, ease: 'power2.out' })
    .to(root.position, { y: CHIBI_ROOT_FLOOR_Y + 0.38, duration: 0.12, ease: 'power2.out' })
    .to(root.position, { y: CHIBI_ROOT_FLOOR_Y, duration: 0.14, ease: 'bounce.out' })

  tl.to({}, { duration: 0.1 })
  return tl
}
