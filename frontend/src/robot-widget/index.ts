import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Raycaster,
  Vector2,
} from 'three'
import {
  CHIBI_CANVAS_BOTTOM_INSET_PX,
  CHIBI_CANVAS_MAX_HEIGHT_PX,
  CHIBI_CANVAS_MAX_HEIGHT_VH,
  CHIBI_CANVAS_MAX_WIDTH_PX,
  CHIBI_DEPTH_SCALE_AT_CLOSE,
  CHIBI_DEPTH_SCALE_AT_FAR,
  CHIBI_ROOT_DISPLAY_SCALE,
  CHIBI_ROOT_FLOOR_Y,
  mergeChibiConfig,
  type ChibiWidgetConfig,
  type ChibiWidgetOptions,
} from './config'
import {
  computeWalkDistanceRange,
  scaleFactorForWalkPosition,
  type WalkDistanceRange,
} from './depthScaleFromCamera'
import { SceneManager } from './core/Scene'
import { WanderController } from './core/WanderController'
import {
  buildChibi,
  getHeadScreenPosition,
  setChibiOutfit,
  setChibiSkin,
  type ChibiParts,
} from './core/ChibiModel'
import { MouseTracker } from './core/MouseTracker'
import { AnimationController } from './core/AnimationController'
import type { ReactionName } from './animations/reactions'
import { SpeechBubble } from './ui/Bubble'

const MAX_HEAD_Y = (35 * Math.PI) / 180
const MAX_HEAD_X = (20 * Math.PI) / 180
const PUPIL_MAX = 0.048

export type ChibiPublicApi = {
  wave: () => void
  say: (text: string) => void
  setOutfit: (hex: string) => void
  setSkin: (hex: string) => void
  setSpeed: (v: number) => void
  /** Реакция на смену страницы SPA: идёт в зону экрана и (со 2-й навигации) коротко комментирует. */
  onRouteChange: (path: string) => void
  destroy: () => void
  hide: () => void
  show: () => void
}

/** Совместимость со старым API */
export type RobotPublicApi = ChibiPublicApi & {
  play: (name?: ReactionName) => void
  setColor: (hex: string) => void
}

declare global {
  interface Window {
    Chibi?: ChibiPublicApi
    Robot?: RobotPublicApi
  }
}

const GREET_RU =
  'Я на связи — кликни на меня, зажми Alt и тащи с любого места страницы, или открой AI-аналитик.'
const GREET_EN =
  "I'm here — click me, or hold Alt and drag me from anywhere on the page, or open AI analytics."

function isPageInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'a,button,input,textarea,select,label,[role="button"],[contenteditable="true"],[data-chibi-no-drag]',
    ),
  )
}

function routeHint(path: string, lang: 'ru' | 'en'): { nx: number; ny: number; msg: string } {
  const m = (ru: string, en: string) => (lang === 'ru' ? ru : en)
  const p = path.split('?')[0] ?? path
  const q = path.includes('?') ? path.slice(path.indexOf('?')) : ''

  if (p === '/' || p === '') {
    return {
      nx: 0.42,
      ny: -0.22,
      msg: m('Дашборд — все фермы под рукой.', 'Dashboard — all farms at a glance.'),
    }
  }
  if (p.startsWith('/ai-analytics')) {
    return {
      nx: 0.5,
      ny: 0.36,
      msg: m('AI-аналитик: индексы и советы.', 'AI analytics: scores and tips.'),
    }
  }
  if (p.startsWith('/profile')) {
    return { nx: 0.52, ny: -0.2, msg: m('Профиль и аккаунт.', 'Profile and account.') }
  }
  if (p.startsWith('/farm/')) {
    if (q.includes('tab=agent')) {
      return {
        nx: -0.4,
        ny: 0.38,
        msg: m('ИИ-агент: спроси про поля и задачи.', 'AI agent: ask about fields and tasks.'),
      }
    }
    if (q.includes('tab=fields')) {
      return {
        nx: -0.32,
        ny: 0.16,
        msg: m('Поля и влажность.', 'Fields and moisture.'),
      }
    }
    if (q.includes('tab=herds')) {
      return { nx: 0.38, ny: 0.14, msg: m('Стада и кормление.', 'Herds and feeding.') }
    }
    if (q.includes('tab=tasks')) {
      return { nx: 0.22, ny: -0.32, msg: m('Задачи на сегодня.', 'Tasks for today.') }
    }
    if (q.includes('tab=team')) {
      return { nx: -0.22, ny: -0.28, msg: m('Команда фермы.', 'Farm team.') }
    }
    return {
      nx: -0.28,
      ny: 0.26,
      msg: m('Обзор хозяйства.', 'Farm overview.'),
    }
  }
  return { nx: 0.05, ny: 0.12, msg: m('Продолжаем!', "Let's go!") }
}

class ChibiWidgetHost {
  private readonly canvas: HTMLCanvasElement
  private readonly sceneMgr: SceneManager
  private readonly parts: ChibiParts
  private readonly mouse: MouseTracker
  private readonly wander: WanderController
  private readonly anim: AnimationController
  private readonly bubble: SpeechBubble
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private speed: number
  private raf = 0
  private disposed = false
  private entryDone = false
  private pendingRoute: string | null = null
  private lastRoute: string | null = null
  private routeApplyCount = 0
  private readonly lang: 'ru' | 'en'
  private readonly onOpenAgent?: () => void
  private lastFrameTs = 0
  private walkPhase = 0
  private walking = false
  private bodyRestY = 0.385
  private robotGrab: null | {
    pointerId: number
    startX: number
    startY: number
    dragging: boolean
    /** Тап по мешу робота (не Alt-драг с пустого места) — открыть агента */
    fromMesh: boolean
  } = null
  /** Последние координаты указателя при драге — позиция обновляется в RAF. */
  private dragPointerX: number | null = null
  private dragPointerY: number | null = null
  private depthDistRange: WalkDistanceRange | null = null

  private refreshDepthDistRange() {
    this.depthDistRange = computeWalkDistanceRange(
      this.sceneMgr.camera.position,
      this.wander.getWalkBounds(),
    )
  }

  private applyRouteChange(path: string) {
    if (!path || this.lastRoute === path) return
    this.lastRoute = path
    const hint = routeHint(path, this.lang)
    this.wander.setGoalFromScreenNDC(hint.nx, hint.ny)
    this.routeApplyCount++
    if (this.routeApplyCount <= 1) return
    if (this.anim.isReactionActive()) return
    this.anim.play('wave')
    this.bubble.say(hint.msg, 3200)
  }

  /** Смена страницы из React Router (можно вызвать до окончания entry — отложится). */
  handleRouteChange(path: string) {
    if (this.disposed) return
    if (!this.entryDone) {
      this.pendingRoute = path
      return
    }
    this.applyRouteChange(path)
  }

  private applyRootScaleWithDepth() {
    const r = this.parts.root.position
    const rng = this.depthDistRange
    if (!rng || rng.maxD - rng.minD < 1e-4) {
      this.parts.root.scale.setScalar(CHIBI_ROOT_DISPLAY_SCALE)
      return
    }
    const m = scaleFactorForWalkPosition(
      r.x,
      r.z,
      this.sceneMgr.camera.position,
      rng,
      CHIBI_DEPTH_SCALE_AT_CLOSE,
      CHIBI_DEPTH_SCALE_AT_FAR,
    )
    const s = CHIBI_ROOT_DISPLAY_SCALE * m
    if (!Number.isFinite(s) || s < 1e-4) {
      this.parts.root.scale.setScalar(CHIBI_ROOT_DISPLAY_SCALE)
      return
    }
    this.parts.root.scale.setScalar(s)
  }

  /**
   * Сброс захвата указателя. Если pointerup не пришёл (Alt+Tab, потеря capture),
   * без этого robotGrab остаётся навсегда — не работает ни блуждание, ни новый драг.
   */
  private releaseRobotGrabById(pointerId: number, playCelebrationIfTap: boolean) {
    const g = this.robotGrab
    if (!g || g.pointerId !== pointerId) return
    const wasDrag = g.dragging
    this.dragPointerX = null
    this.dragPointerY = null
    this.robotGrab = null
    // До releasePointerCapture — иначе lostpointercapture вызовет этот же код повторно.
    this.tryReleasePointer(pointerId)
    if (!this.entryDone) return
    if (wasDrag) {
      if (this.walking) {
        this.walking = false
        this.anim.resumeIdleArms()
        this.parts.legL.rotation.x = 0
        this.parts.legR.rotation.x = 0
        this.parts.body.rotation.z = 0
        this.parts.body.position.y = this.bodyRestY
        this.parts.armL.rotation.x = 0
        this.parts.armR.rotation.x = 0
      }
      this.wander.bootstrap(this.parts.root.position.x, this.parts.root.position.z)
    } else if (playCelebrationIfTap) {
      if (g.fromMesh && this.onOpenAgent) {
        this.onOpenAgent()
        this.anim.play('wave')
        this.bubble.say(this.lang === 'ru' ? 'Открываю ИИ-агента…' : 'Opening AI agent…', 2200)
      } else {
        this.anim.playClickCelebration()
        const phrases =
          this.lang === 'ru'
            ? ['Ура!', 'Класс!', 'Пошли на ферму?', 'Я рад!', 'Ещё раз!']
            : ['Yay!', 'Nice!', 'Farm time?', 'So happy!', 'Again!']
        this.bubble.say(phrases[Math.floor(Math.random() * phrases.length)] ?? '…', 2600)
      }
    }
  }

  private onResize = () => {
    const w = this.canvas.clientWidth || window.innerWidth
    const h =
      this.canvas.clientHeight || Math.max(1, window.innerHeight - CHIBI_CANVAS_BOTTOM_INSET_PX)
    this.sceneMgr.setSize(w, h)
    this.wander.refreshRangeFromViewport()
    this.refreshDepthDistRange()
  }

  private setRaycastFromClient(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.sceneMgr.camera)
  }

  private tryCapturePointer(pointerId: number) {
    this.canvas.style.pointerEvents = 'auto'
    try {
      this.canvas.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }

  private tryReleasePointer(pointerId: number) {
    try {
      this.canvas.releasePointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    this.canvas.style.pointerEvents = 'none'
  }

  private onMove = (e: PointerEvent) => {
    this.mouse.setFromClient(e.clientX, e.clientY)
    const g = this.robotGrab
    if (!g || e.pointerId !== g.pointerId) return
    // У мыши/пера во время drag часто приходит buttons === 0 — не обрываем перетаскивание.
    const mouseLike = e.pointerType === 'mouse' || e.pointerType === 'pen'
    if (!g.dragging && mouseLike && (e.buttons & 1) === 0) return

    const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY)
    if (moved > 3) g.dragging = true
    if (g.dragging) {
      this.dragPointerX = e.clientX
      this.dragPointerY = e.clientY
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.disposed || !this.entryDone || e.button !== 0 || this.anim.isReactionActive()) return

    // Alt + не по кнопке/ссылке: перенос робота с любой точки страницы (курсор → пол)
    if (e.altKey && !isPageInteractiveTarget(e.target)) {
      e.preventDefault()
      this.robotGrab = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: true,
        fromMesh: false,
      }
      this.dragPointerX = e.clientX
      this.dragPointerY = e.clientY
      this.tryCapturePointer(e.pointerId)
      return
    }

    this.parts.root.updateMatrixWorld(true)
    this.setRaycastFromClient(e.clientX, e.clientY)
    const hits = this.raycaster.intersectObjects(this.parts.raycastMeshes, false)
    if (hits.length > 0) {
      e.preventDefault()
      this.robotGrab = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        fromMesh: true,
      }
      this.tryCapturePointer(e.pointerId)
    } else if (this.robotGrab) {
      this.releaseRobotGrabById(this.robotGrab.pointerId, false)
    }
  }

  private onPointerCancel = (e: PointerEvent) => {
    this.releaseRobotGrabById(e.pointerId, false)
  }

  private onPointerUp = (e: PointerEvent) => {
    this.releaseRobotGrabById(e.pointerId, true)
  }

  private onWindowBlur = () => {
    if (this.robotGrab) this.releaseRobotGrabById(this.robotGrab.pointerId, false)
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && this.robotGrab) {
      this.releaseRobotGrabById(this.robotGrab.pointerId, false)
    }
  }

  /** Резерв, если pointerup не дошёл (редко, но тогда robotGrab «вечный»). */
  private onWindowMouseUp = (e: MouseEvent) => {
    if (e.button !== 0 || !this.robotGrab) return
    this.releaseRobotGrabById(this.robotGrab.pointerId, true)
  }

  private onLostPointerCapture = (e: PointerEvent) => {
    if (this.robotGrab && e.pointerId === this.robotGrab.pointerId) {
      this.releaseRobotGrabById(e.pointerId, false)
    }
  }

  private onClick = (e: MouseEvent) => {
    if (this.disposed) return
    this.parts.root.updateMatrixWorld(true)
    this.setRaycastFromClient(e.clientX, e.clientY)
    const hits = this.raycaster.intersectObjects(this.parts.raycastMeshes, false)
    if (hits.length > 0) {
      return
    }
    this.mouse.setFromClient(e.clientX, e.clientY)
    const r = this.parts.root.position
    const dx = this.mouse.target.x - r.x
    const dz = this.mouse.target.z - r.z
    const yaw = Math.atan2(dx, dz)
    this.parts.head.rotation.y = Math.max(-MAX_HEAD_Y, Math.min(MAX_HEAD_Y, yaw))
    this.parts.head.rotation.x = Math.max(
      -MAX_HEAD_X,
      Math.min(MAX_HEAD_X, -this.mouse.ndcY * MAX_HEAD_X),
    )
  }

  constructor(cfg: ChibiWidgetConfig) {
    this.speed = cfg.speed
    this.lang = cfg.lang
    this.onOpenAgent = cfg.onOpenAgent

    this.canvas = document.createElement('canvas')
    this.canvas.setAttribute('aria-hidden', 'true')
    const dockH = `min(${CHIBI_CANVAS_MAX_HEIGHT_VH}vh,${CHIBI_CANVAS_MAX_HEIGHT_PX}px)`
    const dockW = `min(100vw,${CHIBI_CANVAS_MAX_WIDTH_PX}px)`
    this.canvas.style.cssText = `position:fixed;left:auto;top:auto;right:0;bottom:${CHIBI_CANVAS_BOTTOM_INSET_PX}px;width:${dockW};height:${dockH};max-width:100%;pointer-events:none;z-index:${cfg.zIndex}`
    document.body.appendChild(this.canvas)
    void this.canvas.offsetHeight

    this.sceneMgr = new SceneManager(this.canvas)
    this.sceneMgr.setupImageBasedLighting()
    this.sceneMgr.scene.add(new HemisphereLight(0xa7f3d0, 0xfff7ed, 0.24))
    this.sceneMgr.scene.add(new AmbientLight(0xe8f5f0, 0.4))
    const dir = new DirectionalLight(0xfffdfb, 0.88)
    dir.position.set(2.2, 6.5, 3.5)
    this.sceneMgr.scene.add(dir)

    this.parts = buildChibi(cfg.outfit, cfg.skin)
    this.sceneMgr.scene.add(this.parts.root)

    this.mouse = new MouseTracker(this.canvas, this.sceneMgr.camera)
    const iw = this.canvas.clientWidth || window.innerWidth
    const ih =
      this.canvas.clientHeight || Math.max(1, window.innerHeight - CHIBI_CANVAS_BOTTOM_INSET_PX)
    const sx = iw * (0.18 + Math.random() * 0.64)
    const sy = ih * (0.18 + Math.random() * 0.52)
    this.mouse.setFromClient(sx, sy)
    const g0 = this.mouse.groundXZFromClient(sx, sy)
    if (g0) {
      this.parts.root.position.set(g0.x, CHIBI_ROOT_FLOOR_Y, g0.z)
    } else {
      this.parts.root.position.set(this.mouse.target.x, CHIBI_ROOT_FLOOR_Y, 0)
    }

    this.wander = new WanderController(this.canvas, this.sceneMgr.camera)
    this.wander.bootstrap(this.parts.root.position.x, this.parts.root.position.z)

    this.bubble = new SpeechBubble(cfg.zIndex)

    this.anim = new AnimationController(this.parts)
    this.anim.runEntry(() => {
      this.parts.root.position.y = CHIBI_ROOT_FLOOR_Y
      this.parts.root.scale.set(CHIBI_ROOT_DISPLAY_SCALE, CHIBI_ROOT_DISPLAY_SCALE, CHIBI_ROOT_DISPLAY_SCALE)
      this.bodyRestY = this.parts.body.position.y
      this.entryDone = true
      this.lastFrameTs = performance.now()
      this.anim.startIdle()
      this.wander.refreshRangeFromViewport()
      this.wander.bootstrap(this.parts.root.position.x, this.parts.root.position.z)
      this.refreshDepthDistRange()
      this.applyRootScaleWithDepth()
      if (this.pendingRoute) {
        this.applyRouteChange(this.pendingRoute)
        this.pendingRoute = null
      } else {
        this.applyRouteChange(`${window.location.pathname}${window.location.search}`)
      }
      this.bubble.say(this.lang === 'ru' ? 'Привет!' : 'Hi!', 1600)
      window.setTimeout(() => {
        if (this.disposed) return
        this.bubble.say(this.lang === 'ru' ? GREET_RU : GREET_EN, 4800)
      }, 1100)
      window.setTimeout(() => {
        if (this.disposed) return
        this.bubble.startAutoPhrases(this.lang, 5200 + Math.random() * 600)
      }, 6200)
    })

    window.addEventListener('resize', this.onResize)
    requestAnimationFrame(() => this.onResize())
    window.addEventListener('pointermove', this.onMove, { passive: true })
    window.addEventListener('pointerdown', this.onPointerDown, { capture: true, passive: false })
    window.addEventListener('pointerup', this.onPointerUp, true)
    window.addEventListener('pointercancel', this.onPointerCancel, true)
    window.addEventListener('mouseup', this.onWindowMouseUp, true)
    window.addEventListener('blur', this.onWindowBlur)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    document.addEventListener('lostpointercapture', this.onLostPointerCapture, true)
    window.addEventListener('click', this.onClick, true)

    const loop = () => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(loop)
      if (this.entryDone) {
        const now = performance.now()
        const dt = Math.min(0.05, Math.max(0.001, (now - (this.lastFrameTs || now)) / 1000))
        this.lastFrameTs = now

        const r = this.parts.root.position
        const busy = this.anim.isReactionActive()
        const grabbed = this.robotGrab !== null

        if (
          this.robotGrab?.dragging &&
          this.dragPointerX != null &&
          this.dragPointerY != null &&
          this.entryDone
        ) {
          const p = this.mouse.groundXZFromClient(this.dragPointerX, this.dragPointerY)
          if (p) {
            const c = this.wander.clampXZ(p.x, p.z)
            r.x = c.x
            r.z = c.z
            r.y = CHIBI_ROOT_FLOOR_Y
          }
        }

        if (!busy && !grabbed) {
          this.wander.update(dt, r.x, r.z)
          const toX = this.wander.goalX - r.x
          const toZ = this.wander.goalZ - r.z
          const dist = Math.hypot(toX, toZ)
          const unitsPerSec = MathUtils.lerp(0.28, 0.68, MathUtils.clamp((this.speed - 0.02) / 0.1, 0, 1))
          const maxStep = unitsPerSec * dt
          let stepX = 0
          let stepZ = 0
          if (dist > 1e-5) {
            const travel = Math.min(dist, maxStep)
            stepX = (toX / dist) * travel
            stepZ = (toZ / dist) * travel
          }
          r.x += stepX
          r.z += stepZ
          r.y = CHIBI_ROOT_FLOOR_Y

          const moving = dist > 0.045 || Math.hypot(stepX, stepZ) > 0.0005
          const wasWalking = this.walking
          this.walking = moving

          if (this.walking) {
            if (!wasWalking) this.anim.pauseIdleArms()
            this.walkPhase += dt * 7.8
            const s = Math.sin(this.walkPhase)
            const c = Math.sin(this.walkPhase + Math.PI)
            this.parts.legL.rotation.x = s * 0.4
            this.parts.legR.rotation.x = c * 0.4
            this.parts.body.position.y = this.bodyRestY + Math.abs(s) * 0.024
            this.parts.body.rotation.z = s * 0.045
            this.parts.armL.rotation.x = c * 0.12
            this.parts.armL.rotation.z = -0.06 + s * 0.1
            this.parts.armR.rotation.x = s * 0.11
            this.parts.armR.rotation.z = 0.05 + c * 0.09

            const face = Math.atan2(toX, toZ)
            const clampFace = MathUtils.clamp(face, -1.1, 1.1)
            this.parts.root.rotation.y += (clampFace - this.parts.root.rotation.y) * 0.14
          } else {
            if (wasWalking) {
              this.anim.resumeIdleArms()
              this.parts.legL.rotation.x = 0
              this.parts.legR.rotation.x = 0
              this.parts.body.rotation.z = 0
              this.parts.body.position.y = this.bodyRestY
              this.parts.armL.rotation.x = 0
              this.parts.armR.rotation.x = 0
            }
            this.parts.root.rotation.y += (0 - this.parts.root.rotation.y) * 0.08
          }
        }

        const t = this.mouse.target
        const dx = t.x - r.x
        const dz = t.z - r.z
        const yaw = Math.atan2(dx, dz)
        const clampY = Math.max(-MAX_HEAD_Y, Math.min(MAX_HEAD_Y, yaw))
        this.parts.head.rotation.y += (clampY - this.parts.head.rotation.y) * 0.11

        const pitch = Math.max(-MAX_HEAD_X, Math.min(MAX_HEAD_X, -this.mouse.ndcY * MAX_HEAD_X))
        this.parts.head.rotation.x += (pitch - this.parts.head.rotation.x) * 0.1

        const px = Math.max(-1, Math.min(1, this.mouse.ndcX)) * (PUPIL_MAX * 0.92)
        const py = Math.max(-1, Math.min(1, this.mouse.ndcY)) * (PUPIL_MAX * 0.85)
        this.parts.pupilL.position.x = px
        this.parts.pupilL.position.y = py
        this.parts.pupilR.position.x = px
        this.parts.pupilR.position.y = py

        if (!this.depthDistRange) this.refreshDepthDistRange()
        this.applyRootScaleWithDepth()
      }
      const hp = getHeadScreenPosition(this.parts, this.sceneMgr.camera, this.canvas)
      this.bubble.setPosition(hp.x, hp.y)
      this.sceneMgr.render()
    }
    this.raf = requestAnimationFrame(loop)
  }

  setSpeed(v: number) {
    this.speed = Math.max(0.02, Math.min(0.12, v))
  }

  setOutfit(hex: string) {
    setChibiOutfit(this.parts, hex)
  }

  setSkin(hex: string) {
    setChibiSkin(this.parts, hex)
  }

  hide() {
    this.canvas.style.visibility = 'hidden'
    this.bubble.el.style.visibility = 'hidden'
  }

  show() {
    this.canvas.style.visibility = 'visible'
    this.bubble.el.style.visibility = 'visible'
  }

  teardown() {
    if (this.disposed) return
    this.disposed = true
    if (this.robotGrab) {
      this.tryReleasePointer(this.robotGrab.pointerId)
      this.robotGrab = null
      this.dragPointerX = null
      this.dragPointerY = null
    }
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerdown', this.onPointerDown, true)
    window.removeEventListener('pointerup', this.onPointerUp, true)
    window.removeEventListener('pointercancel', this.onPointerCancel, true)
    window.removeEventListener('mouseup', this.onWindowMouseUp, true)
    window.removeEventListener('blur', this.onWindowBlur)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    document.removeEventListener('lostpointercapture', this.onLostPointerCapture, true)
    window.removeEventListener('click', this.onClick, true)
    this.anim.killAll()
    this.bubble.destroy()
    this.sceneMgr.dispose()
    this.canvas.remove()
    if (window.Chibi) delete window.Chibi
    if (window.Robot) delete window.Robot
  }

  getApi(): ChibiPublicApi {
    return {
      wave: () => {
        this.anim.play('wave')
      },
      say: (text: string) => this.bubble.say(text),
      setOutfit: (hex: string) => this.setOutfit(hex),
      setSkin: (hex: string) => this.setSkin(hex),
      setSpeed: (v: number) => this.setSpeed(v),
      onRouteChange: (path: string) => this.handleRouteChange(path),
      destroy: () => this.teardown(),
      hide: () => this.hide(),
      show: () => this.show(),
    }
  }

  /** Старый API Robot */
  getLegacyApi(): RobotPublicApi {
    const base = this.getApi()
    return {
      ...base,
      play: (name) => {
        this.anim.play(name)
      },
      setColor: (hex: string) => this.setOutfit(hex),
    }
  }
}

let host: ChibiWidgetHost | null = null

export function initChibiWidget(options?: ChibiWidgetOptions): ChibiPublicApi {
  if (typeof window === 'undefined') {
    return {
      wave: () => {},
      say: () => {},
      setOutfit: () => {},
      setSkin: () => {},
      setSpeed: () => {},
      onRouteChange: () => {},
      destroy: () => {},
      hide: () => {},
      show: () => {},
    }
  }
  host?.teardown()
  const cfg = mergeChibiConfig(options)
  host = new ChibiWidgetHost(cfg)
  window.Chibi = host.getApi()
  window.Robot = host.getLegacyApi()
  return window.Chibi
}

/** @deprecated имя сохранено для импортов из Layout */
export function initRobotWidget(options?: ChibiWidgetOptions): RobotPublicApi {
  initChibiWidget(options)
  return window.Robot as RobotPublicApi
}

export function destroyChibiWidget() {
  host?.teardown()
  host = null
}

export function destroyRobotWidget() {
  destroyChibiWidget()
}
