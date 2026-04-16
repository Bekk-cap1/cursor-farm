import { Cloud } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { useSatelliteTexture } from './useSatelliteTexture'

/** Упрощённая 3D-сцена: подложка из спутника + участки + солнце + облака. */
function FarmBlocks({
  latitude,
  longitude,
}: {
  latitude: number | null | undefined
  longitude: number | null | undefined
}) {
  const texture = useSatelliteTexture(latitude, longitude)
  const g = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = clock.elapsedTime * 0.1
  })
  return (
    <group ref={g}>
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.4, 2.4]} />
        <meshStandardMaterial
          color={texture ? '#ffffff' : '#78350f'}
          map={texture ?? undefined}
          roughness={0.94}
          metalness={0.02}
        />
      </mesh>
      <mesh position={[-0.45, 0.06, 0.2]} castShadow>
        <boxGeometry args={[0.55, 0.1, 0.48]} />
        <meshStandardMaterial color="#166534" roughness={0.65} />
      </mesh>
      <mesh position={[0.35, 0.05, -0.15]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.55]} />
        <meshStandardMaterial color="#15803d" roughness={0.65} />
      </mesh>
      <mesh position={[0.05, 0.08, 0.35]} castShadow>
        <boxGeometry args={[0.38, 0.12, 0.4]} />
        <meshStandardMaterial color="#14532d" roughness={0.7} />
      </mesh>
      <mesh position={[-0.2, 0.35, -0.5]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

export function DashboardFarmScene({
  className = '',
  latitude,
  longitude,
}: {
  className?: string
  /** Координаты фермы — подложка берётся из спутникового тайла Esri World Imagery */
  latitude?: number | null
  longitude?: number | null
}) {
  return (
    <div className={`touch-none select-none ${className}`}>
      <Canvas
        camera={{ position: [1.1, 0.9, 1.35], fov: 45 }}
        dpr={[1, Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1)]}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[3, 5, 2]} intensity={0.95} castShadow />
        <hemisphereLight args={['#bae6fd', '#78350f', 0.35]} />
        <FarmBlocks latitude={latitude} longitude={longitude} />
        <Cloud position={[-0.8, 0.9, -0.3]} speed={0.15} opacity={0.55} segments={12} />
        <Cloud position={[0.6, 1, 0.2]} speed={0.12} opacity={0.45} segments={10} />
      </Canvas>
    </div>
  )
}

export default DashboardFarmScene
