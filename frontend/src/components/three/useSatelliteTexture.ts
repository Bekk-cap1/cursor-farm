import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { satelliteTileUrlForLatLon } from '../../lib/satelliteTiles'

/** Одна XYZ-плитка спутника по координатам центра участка. */
export function useSatelliteTexture(
  lat: number | null | undefined,
  lon: number | null | undefined,
  zoom = 16,
) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setTexture((t) => {
        t?.dispose()
        return null
      })
      return
    }

    const url = satelliteTileUrlForLatLon(lat, lon, zoom)
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    let cancelled = false

    loader.load(
      url,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        setTexture((old) => {
          old?.dispose()
          return tex
        })
      },
      undefined,
      () => {
        if (!cancelled) {
          setTexture((old) => {
            old?.dispose()
            return null
          })
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [lat, lon, zoom])

  return texture
}
