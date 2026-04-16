/**
 * Тайлы спутниковой съёмки (Web Mercator).
 * Используется Esri World Imagery — в интерфейсе нужна подпись об источнике.
 */

export const DEFAULT_SATELLITE_POINT = { lat: 41.31, lon: 69.28 }

/** Индексы тайла XYZ для lat/lon на масштабе z (slippy map). */
export function latLonToTileXY(lat: number, lon: number, z: number) {
  const latRad = (lat * Math.PI) / 180
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y, z }
}

/** Esri World Imagery — спутник + аэрофото (требуется атрибуция в UI). */
export function esriWorldImageryTileUrl(z: number, x: number, y: number) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

export function satelliteTileUrlForLatLon(lat: number, lon: number, zoom = 16) {
  const { x, y, z } = latLonToTileXY(lat, lon, zoom)
  return esriWorldImageryTileUrl(z, x, y)
}
