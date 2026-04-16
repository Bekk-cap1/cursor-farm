import gsap from 'gsap'
import type { ChibiParts } from '../core/ChibiModel'

/** Стоя на месте: только руки — ноги и вертикаль тела задаётся походкой в RAF. */
export function createIdleTimeline(parts: ChibiParts) {
  const { armL, armR } = parts
  return gsap
    .timeline({
      repeat: -1,
      yoyo: true,
      defaults: { ease: 'sine.inOut', overwrite: 'auto' as const },
    })
    .to(armR.rotation, { z: 0.06, duration: 2.2 }, 0)
    .to(armL.rotation, { z: -0.1, x: 0.08, duration: 1.8 }, 0)
}

/** Моргание: scaleY групп глаз */
export function createBlinkTimeline(parts: ChibiParts) {
  const blinkOnce = () => {
    gsap.to([parts.eyeL.scale, parts.eyeR.scale], {
      y: 0.12,
      duration: 0.07,
      yoyo: true,
      repeat: 1,
      ease: 'power2.inOut',
      overwrite: 'auto',
    })
  }
  return gsap.timeline({ repeat: -1 }).to({}, { duration: 3.6 }).call(blinkOnce)
}
