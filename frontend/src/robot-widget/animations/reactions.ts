import gsap from 'gsap'
import { CHIBI_ROOT_FLOOR_Y } from '../config'
import type { ChibiParts } from '../core/ChibiModel'

export type ReactionName = 'wave' | 'spin' | 'jump'

function wave(parts: ChibiParts) {
  return gsap.timeline({ defaults: { overwrite: 'auto' as const } }).to(parts.armR.rotation, {
    z: -1,
    duration: 0.16,
    yoyo: true,
    repeat: 2,
    ease: 'power2.inOut',
  })
}

function spin(parts: ChibiParts) {
  return gsap.timeline({ defaults: { overwrite: 'auto' as const } }).to(parts.root.rotation, {
    y: `+=${Math.PI * 2}`,
    duration: 0.52,
    ease: 'power2.inOut',
  })
}

function jump(parts: ChibiParts) {
  const { body, root } = parts
  return gsap
    .timeline({ defaults: { overwrite: 'auto' as const } })
    .to(body.scale, { y: 0.78, x: 1.06, duration: 0.06, ease: 'power2.out' })
    .to(root.position, { y: CHIBI_ROOT_FLOOR_Y + 0.36, duration: 0.11, ease: 'power2.out' }, '<')
    .to(root.position, { y: CHIBI_ROOT_FLOOR_Y, duration: 0.13, ease: 'bounce.out' })
    .to(body.scale, { y: 1, x: 1, duration: 0.09, ease: 'elastic.out(1, 0.55)' })
}

const randomPool: ReactionName[] = ['wave', 'jump', 'spin']

export function playReaction(parts: ChibiParts, name?: ReactionName) {
  const pick = name ?? randomPool[Math.floor(Math.random() * randomPool.length)]
  if (pick === 'wave') return wave(parts)
  if (pick === 'spin') return spin(parts)
  return jump(parts)
}

/** Клик по ТЗ: spin + прыжок + wave */
export function playClickCelebration(parts: ChibiParts) {
  return gsap
    .timeline({ defaults: { overwrite: 'auto' as const } })
    .add(spin(parts))
    .add(jump(parts), '-=0.35')
    .add(wave(parts), '-=0.2')
}
