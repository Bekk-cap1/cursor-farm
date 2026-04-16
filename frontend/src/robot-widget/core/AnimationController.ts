import gsap from 'gsap'
import type { ChibiParts } from './ChibiModel'
import { createEntryTimeline } from '../animations/entry'
import { createBlinkTimeline, createIdleTimeline } from '../animations/idle'
import { playClickCelebration, playReaction, type ReactionName } from '../animations/reactions'

export class AnimationController {
  private entryTl: gsap.core.Timeline | null = null
  private idleTl: gsap.core.Timeline | null = null
  private blinkTl: gsap.core.Timeline | null = null
  private activeReaction: gsap.core.Timeline | null = null

  private readonly parts: ChibiParts

  constructor(parts: ChibiParts) {
    this.parts = parts
  }

  runEntry(onComplete: () => void) {
    this.entryTl?.kill()
    this.entryTl = createEntryTimeline(this.parts, onComplete)
    return this.entryTl
  }

  startIdle() {
    this.stopIdle()
    this.idleTl = createIdleTimeline(this.parts)
    this.blinkTl = createBlinkTimeline(this.parts)
  }

  stopIdle() {
    this.idleTl?.kill()
    this.idleTl = null
    this.blinkTl?.kill()
    this.blinkTl = null
  }

  /** Только покачивание рук в стойке; моргание не трогаем. */
  pauseIdleArms() {
    this.idleTl?.kill()
    this.idleTl = null
  }

  resumeIdleArms() {
    if (!this.idleTl) {
      this.idleTl = createIdleTimeline(this.parts)
    }
  }

  isReactionActive() {
    return this.activeReaction != null && this.activeReaction.isActive()
  }

  play(name?: ReactionName) {
    this.activeReaction?.kill()
    this.activeReaction = playReaction(this.parts, name)
    return this.activeReaction
  }

  playClickCelebration() {
    this.activeReaction?.kill()
    this.activeReaction = playClickCelebration(this.parts)
    return this.activeReaction
  }

  killAll() {
    this.entryTl?.kill()
    this.entryTl = null
    this.stopIdle()
    this.activeReaction?.kill()
    this.activeReaction = null
    gsap.killTweensOf(this.parts.root)
    gsap.killTweensOf(this.parts.body)
    gsap.killTweensOf(this.parts.armR.rotation)
    gsap.killTweensOf(this.parts.armL.rotation)
    gsap.killTweensOf(this.parts.head.rotation)
    gsap.killTweensOf(this.parts.legL.rotation)
    gsap.killTweensOf(this.parts.legR.rotation)
    gsap.killTweensOf(this.parts.eyeL.scale)
    gsap.killTweensOf(this.parts.eyeR.scale)
  }
}
