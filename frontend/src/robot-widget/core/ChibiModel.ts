import {
  BoxGeometry,
  Camera,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'

export type ChibiParts = {
  root: Group
  body: Mesh
  head: Group
  headMesh: Mesh
  hairMeshes: Mesh[]
  earL: Mesh
  earR: Mesh
  eyeL: Group
  eyeR: Group
  pupilL: Mesh
  pupilR: Mesh
  armL: Group
  armR: Group
  legL: Group
  legR: Group
  raycastMeshes: Mesh[]
}

type StdOpts = {
  metalness?: number
  roughness?: number
  emissive?: string
  emissiveIntensity?: number
  transparent?: boolean
  opacity?: number
  envMapIntensity?: number
}

function stdMat(color: string, opts: StdOpts = {}) {
  return new MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.52,
    roughness: opts.roughness ?? 0.4,
    envMapIntensity: opts.envMapIntensity ?? 1.05,
    emissive: new Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  })
}

function chassisHex(outfit: Color) {
  const base = new Color('#121820')
  return `#${base.clone().lerp(outfit, 0.26).getHexString()}`
}

function legHex(outfit: Color) {
  const base = new Color('#0f141c')
  return `#${base.clone().lerp(outfit, 0.18).getHexString()}`
}

function bootHex(outfit: Color) {
  const base = new Color('#0a0d12')
  return `#${base.clone().lerp(outfit, 0.12).getHexString()}`
}

function dimAccent(outfit: Color) {
  return `#${outfit.clone().multiplyScalar(0.35).getHexString()}`
}

function buildLedEye(side: 1 | -1, accentHex: string, dark: string) {
  const g = new Group()
  const housing = new Mesh(
    new BoxGeometry(0.082, 0.128, 0.038),
    stdMat(dark, { metalness: 0.62, roughness: 0.32 }),
  )
  const strip = new Mesh(
    new BoxGeometry(0.048, 0.095, 0.014),
    stdMat(accentHex, {
      metalness: 0.22,
      roughness: 0.28,
      emissive: accentHex,
      emissiveIntensity: 1.35,
    }),
  )
  strip.position.z = 0.016
  g.add(housing)
  g.add(strip)
  g.position.set(0.095 * side, 0.072, 0.178)
  return g
}

/**
 * Компактный дроид-ассистент: PBR-корпус, визор, неон из outfit, сенсоры на ушах.
 * Порядок детей body / arm / leg совместим с setChibiOutfit / setChibiSkin.
 */
export function buildChibi(outfitHex: string, skinHex: string): ChibiParts {
  const outfit = new Color(outfitHex)
  const accent = `#${outfit.getHexString()}`
  const chassis = chassisHex(outfit)
  const chassisHi = `#${new Color(chassis).lerp(outfit, 0.12).getHexString()}`
  const legs = legHex(outfit)
  const boots = bootHex(outfit)
  const trim = dimAccent(outfit)
  const dark = '#080a0e'

  const root = new Group()
  root.name = 'Person'

  const body = new Mesh(
    new BoxGeometry(0.34, 0.3, 0.2),
    stdMat(chassis, { emissive: chassisHi, emissiveIntensity: 0.06, metalness: 0.58, roughness: 0.36 }),
  )
  body.name = 'Body'
  body.position.set(0, 0.385, 0)
  root.add(body)

  const collar = new Mesh(
    new TorusGeometry(0.152, 0.018, 10, 28),
    stdMat(accent, {
      metalness: 0.35,
      roughness: 0.32,
      emissive: accent,
      emissiveIntensity: 0.85,
    }),
  )
  collar.rotation.x = Math.PI / 2
  collar.position.set(0, 0.158, 0.02)
  body.add(collar)

  const belt = new Mesh(
    new BoxGeometry(0.3, 0.038, 0.208),
    stdMat(trim, { emissive: accent, emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.45 }),
  )
  belt.position.set(0, -0.02, 0.01)
  body.add(belt)

  const trimL = new Mesh(
    new BoxGeometry(0.036, 0.21, 0.2),
    stdMat(trim, { metalness: 0.55, roughness: 0.38 }),
  )
  trimL.position.set(-0.168, 0.055, 0)
  body.add(trimL)
  const trimR = new Mesh(
    new BoxGeometry(0.036, 0.21, 0.2),
    stdMat(trim, { metalness: 0.55, roughness: 0.38 }),
  )
  trimR.position.set(0.168, 0.055, 0)
  body.add(trimR)

  const head = new Group()
  head.name = 'Head'
  head.position.set(0, 0.265, 0)
  body.add(head)

  const headMesh = new Mesh(
    new OctahedronGeometry(0.168, 1),
    stdMat(chassis, { metalness: 0.64, roughness: 0.34, emissive: chassisHi, emissiveIntensity: 0.04 }),
  )
  headMesh.scale.set(1.02, 1.12, 1.06)
  headMesh.position.set(0, 0.118, 0)
  head.add(headMesh)

  const visorGlass = new Mesh(
    new BoxGeometry(0.22, 0.1, 0.06),
    stdMat('#0d1118', {
      metalness: 0.88,
      roughness: 0.18,
      transparent: true,
      opacity: 0.22,
      envMapIntensity: 1.35,
    }),
  )
  visorGlass.position.set(0, 0.1, 0.168)
  head.add(visorGlass)

  const visorRim = new Mesh(
    new TorusGeometry(0.11, 0.008, 8, 40, Math.PI * 1.78),
    stdMat(accent, {
      metalness: 0.28,
      roughness: 0.3,
      emissive: accent,
      emissiveIntensity: 1.05,
    }),
  )
  visorRim.rotation.x = Math.PI / 2
  visorRim.rotation.z = Math.PI * 0.92
  visorRim.position.set(0, 0.1, 0.198)
  head.add(visorRim)

  const finGeo = new BoxGeometry(0.04, 0.12, 0.14)
  const finMat = stdMat(accent, {
    metalness: 0.42,
    roughness: 0.35,
    emissive: accent,
    emissiveIntensity: 0.55,
  })
  const finL = new Mesh(finGeo, finMat.clone())
  finL.position.set(-0.2, 0.14, -0.06)
  finL.rotation.z = 0.25
  head.add(finL)
  const finR = new Mesh(finGeo, finMat.clone())
  finR.position.set(0.2, 0.14, -0.06)
  finR.rotation.z = -0.25
  head.add(finR)

  const spineVent = new Mesh(
    new BoxGeometry(0.1, 0.14, 0.04),
    stdMat(trim, { emissive: accent, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.42 }),
  )
  spineVent.position.set(0, 0.02, -0.175)
  head.add(spineVent)

  const antennaStem = new Mesh(
    new CylinderGeometry(0.012, 0.016, 0.14, 8),
    stdMat(trim, { metalness: 0.6, roughness: 0.35 }),
  )
  antennaStem.position.set(0.11, 0.32, -0.04)
  head.add(antennaStem)
  const antennaTip = new Mesh(
    new SphereGeometry(0.028, 12, 10),
    stdMat(accent, {
      metalness: 0.2,
      roughness: 0.25,
      emissive: accent,
      emissiveIntensity: 1.4,
    }),
  )
  antennaTip.position.set(0.11, 0.405, -0.04)
  head.add(antennaTip)

  const earL = new Mesh(
    new SphereGeometry(0.052, 12, 10),
    stdMat(skinHex, {
      metalness: 0.35,
      roughness: 0.45,
      emissive: skinHex,
      emissiveIntensity: 0.35,
    }),
  )
  earL.scale.set(0.85, 1.05, 0.95)
  earL.position.set(-0.2, 0.06, 0.02)
  head.add(earL)
  const earR = new Mesh(
    new SphereGeometry(0.052, 12, 10),
    stdMat(skinHex, {
      metalness: 0.35,
      roughness: 0.45,
      emissive: skinHex,
      emissiveIntensity: 0.35,
    }),
  )
  earR.scale.set(0.85, 1.05, 0.95)
  earR.position.set(0.2, 0.06, 0.02)
  head.add(earR)

  const eyeL = buildLedEye(-1, accent, dark)
  const eyeR = buildLedEye(1, accent, dark)
  head.add(eyeL)
  head.add(eyeR)

  const sensorMat = stdMat(skinHex, {
    metalness: 0.15,
    roughness: 0.22,
    emissive: skinHex,
    emissiveIntensity: 0.9,
  })
  const pupilL = new Mesh(new SphereGeometry(0.02, 10, 8), sensorMat.clone())
  pupilL.name = 'Pupil'
  pupilL.position.set(-0.078, 0.072, 0.205)
  head.add(pupilL)
  const pupilR = new Mesh(new SphereGeometry(0.02, 10, 8), sensorMat.clone())
  pupilR.name = 'Pupil'
  pupilR.position.set(0.078, 0.072, 0.205)
  head.add(pupilR)

  const armMat = stdMat(chassis, { emissive: chassisHi, emissiveIntensity: 0.05, metalness: 0.56, roughness: 0.38 })
  const armL = new Group()
  armL.name = 'ArmL'
  armL.position.set(-0.218, 0.085, 0)
  const upperL = new Mesh(new BoxGeometry(0.095, 0.14, 0.095), armMat.clone())
  upperL.position.set(0, -0.078, 0)
  armL.add(upperL)
  const lowerL = new Mesh(new BoxGeometry(0.086, 0.14, 0.086), armMat.clone())
  lowerL.position.set(0, -0.215, 0)
  armL.add(lowerL)
  const handL = new Mesh(
    new SphereGeometry(0.056, 10, 10),
    stdMat(skinHex, { metalness: 0.4, roughness: 0.42, emissive: skinHex, emissiveIntensity: 0.25 }),
  )
  handL.position.set(0, -0.318, 0)
  armL.add(handL)

  const armR = new Group()
  armR.name = 'ArmR'
  armR.position.set(0.218, 0.085, 0)
  const upperR = new Mesh(new BoxGeometry(0.095, 0.14, 0.095), armMat.clone())
  upperR.position.set(0, -0.078, 0)
  armR.add(upperR)
  const lowerR = new Mesh(new BoxGeometry(0.086, 0.14, 0.086), armMat.clone())
  lowerR.position.set(0, -0.215, 0)
  armR.add(lowerR)
  const handR = new Mesh(
    new SphereGeometry(0.056, 10, 10),
    stdMat(skinHex, { metalness: 0.4, roughness: 0.42, emissive: skinHex, emissiveIntensity: 0.25 }),
  )
  handR.position.set(0, -0.318, 0)
  armR.add(handR)

  body.add(armL)
  body.add(armR)

  const legMat = stdMat(legs, { emissive: legs, emissiveIntensity: 0.04, metalness: 0.52, roughness: 0.44 })
  const bootMat = stdMat(boots, { emissive: boots, emissiveIntensity: 0.03, metalness: 0.55, roughness: 0.4 })

  const legL = new Group()
  legL.name = 'LegL'
  legL.position.set(-0.098, -0.285, 0)
  const thighL = new Mesh(new BoxGeometry(0.115, 0.12, 0.115), legMat.clone())
  thighL.position.set(0, -0.075, 0)
  legL.add(thighL)
  const shinL = new Mesh(new BoxGeometry(0.098, 0.12, 0.098), legMat.clone())
  shinL.position.set(0, -0.195, 0)
  legL.add(shinL)
  const bootL = new Mesh(new BoxGeometry(0.125, 0.075, 0.19), bootMat.clone())
  bootL.position.set(0, -0.315, 0.025)
  legL.add(bootL)

  const legR = new Group()
  legR.name = 'LegR'
  legR.position.set(0.098, -0.285, 0)
  const thighR = new Mesh(new BoxGeometry(0.115, 0.12, 0.115), legMat.clone())
  thighR.position.set(0, -0.075, 0)
  legR.add(thighR)
  const shinR = new Mesh(new BoxGeometry(0.098, 0.12, 0.098), legMat.clone())
  shinR.position.set(0, -0.195, 0)
  legR.add(shinR)
  const bootR = new Mesh(new BoxGeometry(0.125, 0.075, 0.19), bootMat.clone())
  bootR.position.set(0, -0.315, 0.025)
  legR.add(bootR)

  body.add(legL)
  body.add(legR)

  const hairMeshes = [finL, finR, spineVent, visorRim, antennaTip]

  /** Невидимый объём — проще попасть лучом при драге мышью. */
  const dragHit = new Mesh(
    new SphereGeometry(0.52, 10, 8),
    new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  )
  dragHit.name = 'DragHit'
  dragHit.position.set(0, 0.44, 0)
  root.add(dragHit)

  const raycastMeshes: Mesh[] = [
    dragHit,
    body,
    collar,
    belt,
    trimL,
    trimR,
    headMesh,
    visorGlass,
    ...hairMeshes,
    antennaStem,
    earL,
    earR,
    upperL,
    lowerL,
    handL,
    upperR,
    lowerR,
    handR,
    thighL,
    shinL,
    bootL,
    thighR,
    shinR,
    bootR,
    pupilL,
    pupilR,
  ]
  eyeL.traverse((o) => {
    if (o instanceof Mesh) raycastMeshes.push(o)
  })
  eyeR.traverse((o) => {
    if (o instanceof Mesh) raycastMeshes.push(o)
  })

  return {
    root,
    body,
    head,
    headMesh,
    hairMeshes,
    earL,
    earR,
    eyeL,
    eyeR,
    pupilL,
    pupilR,
    armL,
    armR,
    legL,
    legR,
    raycastMeshes,
  }
}

const _headWorld = new Vector3()

export function getHeadScreenPosition(parts: ChibiParts, camera: Camera, canvas: HTMLCanvasElement) {
  parts.head.getWorldPosition(_headWorld)
  _headWorld.y += 0.32
  _headWorld.project(camera)
  const rect = canvas.getBoundingClientRect()
  const x = rect.left + (_headWorld.x * 0.5 + 0.5) * rect.width
  const y = rect.top + (-_headWorld.y * 0.5 + 0.5) * rect.height
  return { x, y }
}

function applyBodyPlating(parts: ChibiParts, outfit: Color) {
  const chassis = chassisHex(outfit)
  const chassisHi = `#${new Color(chassis).lerp(outfit, 0.12).getHexString()}`
  const bodyMat = parts.body.material as MeshStandardMaterial
  bodyMat.color.set(chassis)
  bodyMat.emissive.set(chassisHi)
  bodyMat.emissiveIntensity = 0.06
}

export function setChibiOutfit(parts: ChibiParts, outfitHex: string) {
  const outfit = new Color(outfitHex)
  const accent = `#${outfit.getHexString()}`
  const legs = legHex(outfit)
  const boots = bootHex(outfit)
  const trim = dimAccent(outfit)

  applyBodyPlating(parts, outfit)

  const children = parts.body.children
  const collar = children[0] as Mesh
  if (collar) {
    const cm = collar.material as MeshStandardMaterial
    cm.color.set(accent)
    cm.emissive.set(accent)
    cm.emissiveIntensity = 0.85
  }
  const belt = children[1] as Mesh
  if (belt) {
    const bm = belt.material as MeshStandardMaterial
    bm.color.set(trim)
    bm.emissive.set(accent)
    bm.emissiveIntensity = 0.45
  }
  const tL = children[2] as Mesh
  const tR = children[3] as Mesh
  if (tL) {
    const m = tL.material as MeshStandardMaterial
    m.color.set(trim)
    m.emissive.set(0x000000)
    m.emissiveIntensity = 0
  }
  if (tR) {
    const m = tR.material as MeshStandardMaterial
    m.color.set(trim)
    m.emissive.set(0x000000)
    m.emissiveIntensity = 0
  }

  const hair = parts.hairMeshes
  for (let i = 0; i < hair.length; i++) {
    const mesh = hair[i]!
    const hm = mesh.material as MeshStandardMaterial
    if (i === 2) {
      hm.color.set(trim)
      hm.emissive.set(accent)
      hm.emissiveIntensity = 0.35
    } else {
      hm.color.set(accent)
      hm.emissive.set(accent)
      hm.emissiveIntensity = i === 3 ? 1.05 : i === 4 ? 1.4 : 0.55
    }
  }

  const armBase = parts.armL.children[0] as Mesh
  const armMat = armBase.material as MeshStandardMaterial
  const chassis = chassisHex(outfit)
  const chassisHi = `#${new Color(chassis).lerp(outfit, 0.12).getHexString()}`
  armMat.color.set(chassis)
  armMat.emissive.set(chassisHi)
  armMat.emissiveIntensity = 0.05
  ;(parts.armL.children[1] as Mesh).material = armMat.clone()
  ;(parts.armR.children[0] as Mesh).material = armMat.clone()
  ;(parts.armR.children[1] as Mesh).material = armMat.clone()

  const legMat = (parts.legL.children[0] as Mesh).material as MeshStandardMaterial
  legMat.color.set(legs)
  legMat.emissive.set(legs)
  legMat.emissiveIntensity = 0.04
  ;(parts.legL.children[1] as Mesh).material = legMat.clone()
  ;(parts.legR.children[0] as Mesh).material = legMat.clone()
  ;(parts.legR.children[1] as Mesh).material = legMat.clone()

  const bootMat = (parts.legL.children[2] as Mesh).material as MeshStandardMaterial
  bootMat.color.set(boots)
  bootMat.emissive.set(boots)
  bootMat.emissiveIntensity = 0.03
  ;(parts.legR.children[2] as Mesh).material = bootMat.clone()

  const syncLed = (eye: Group) => {
    const strip = eye.children[1] as Mesh | undefined
    if (!strip) return
    const sm = strip.material as MeshStandardMaterial
    sm.color.set(accent)
    sm.emissive.set(accent)
    sm.emissiveIntensity = 1.35
  }
  syncLed(parts.eyeL)
  syncLed(parts.eyeR)

  const hm = parts.headMesh.material as MeshStandardMaterial
  hm.color.set(chassis)
  hm.emissive.set(chassisHi)
  hm.emissiveIntensity = 0.04
}

export function setChibiSkin(parts: ChibiParts, skinHex: string) {
  const skin = new Color(skinHex)
  const bodyCol = new Color((parts.body.material as MeshStandardMaterial).color)
  const helmetTint = bodyCol.clone().lerp(skin, 0.22)

  const hm = parts.headMesh.material as MeshStandardMaterial
  hm.color.copy(helmetTint)
  hm.emissive.set(skinHex)
  hm.emissiveIntensity = 0.07

  const earL = parts.earL.material as MeshStandardMaterial
  earL.color.set(skinHex)
  earL.emissive.set(skinHex)
  earL.emissiveIntensity = 0.35
  const earR = parts.earR.material as MeshStandardMaterial
  earR.color.set(skinHex)
  earR.emissive.set(skinHex)
  earR.emissiveIntensity = 0.35

  const handL = parts.armL.children[2] as Mesh
  const handR = parts.armR.children[2] as Mesh
  const hlm = handL.material as MeshStandardMaterial
  hlm.color.set(skinHex)
  hlm.emissive.set(skinHex)
  hlm.emissiveIntensity = 0.25
  const hrm = handR.material as MeshStandardMaterial
  hrm.color.set(skinHex)
  hrm.emissive.set(skinHex)
  hrm.emissiveIntensity = 0.25

  const pl = parts.pupilL.material as MeshStandardMaterial
  pl.color.set(skinHex)
  pl.emissive.set(skinHex)
  pl.emissiveIntensity = 0.9
  const pr = parts.pupilR.material as MeshStandardMaterial
  pr.color.set(skinHex)
  pr.emissive.set(skinHex)
  pr.emissiveIntensity = 0.9
}
