import {
  ACESFilmicToneMapping,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Прозрачный фон; PBR-отражения через scene.environment (PMREM из RoomEnvironment).
 */
export class SceneManager {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  private pmremGen: PMREMGenerator | null = null

  constructor(canvas: HTMLCanvasElement) {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    this.camera = new PerspectiveCamera(45, w / Math.max(h, 1), 0.1, 100)
    this.camera.position.set(0, 1.22, 6.25)
    this.camera.lookAt(0, 0.44, 0)

    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 1.5))
    this.renderer.setSize(w, h, false)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = SRGBColorSpace
  }

  /** IBL для MeshStandard — вызывать один раз после создания. */
  setupImageBasedLighting() {
    if (this.scene.environment) return
    const room = new RoomEnvironment()
    this.pmremGen = new PMREMGenerator(this.renderer)
    const rt = this.pmremGen.fromScene(room, 0.0325)
    this.scene.environment = rt.texture
    room.dispose()
    this.pmremGen.dispose()
    this.pmremGen = null
  }

  setSize(width: number, height: number) {
    const h = Math.max(height, 1)
    this.camera.aspect = width / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    const env = this.scene.environment
    if (env) {
      env.dispose()
      this.scene.environment = null
    }
    this.renderer.dispose()
    this.scene.clear()
  }
}
