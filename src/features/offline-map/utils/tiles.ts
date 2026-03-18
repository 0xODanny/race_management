import type { BoundingBox, TileCoord } from '../types'

// Slippy map tile helpers (Web Mercator).
function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTileY(lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180
  const n = Math.tan(Math.PI / 4 + latRad / 2)
  return Math.floor(((1 - Math.log(n) / Math.PI) / 2) * 2 ** z)
}

export function tilesForBoundingBox(bbox: BoundingBox, minZoom: number, maxZoom: number): TileCoord[] {
  const tiles: TileCoord[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lonToTileX(bbox.west, z)
    const xMax = lonToTileX(bbox.east, z)
    const yMin = latToTileY(bbox.north, z)
    const yMax = latToTileY(bbox.south, z)

    for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
      for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
        tiles.push({ z, x, y })
      }
    }
  }
  return tiles
}

// MapLibre (WebGL) generally requires same-origin (or CORS-enabled) tile responses.
// For the default OSM host, we proxy it through our own origin at `/tiles/...`.
export function normalizeTileTemplateUrl(templateUrl: string): string {
  if (templateUrl.startsWith('https://tile.openstreetmap.org/')) {
    return '/tiles/{z}/{x}/{y}.png'
  }
  return templateUrl
}

export function tileUrl(templateUrl: string, c: TileCoord) {
  return templateUrl.replace('{z}', String(c.z)).replace('{x}', String(c.x)).replace('{y}', String(c.y))
}

export function tileKey(eventId: string, packageVersion: string, c: TileCoord) {
  return `${eventId}:${packageVersion}:${c.z}:${c.x}:${c.y}`
}
