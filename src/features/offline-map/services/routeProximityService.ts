import type { LatLng, OfflineRouteOverlay } from '../types'
import { distancePointToSegmentMeters } from '../utils/geo'

function coordsToLatLng(c: number[]): LatLng {
  return { lon: c[0]!, lat: c[1]! }
}

export function distanceToRouteMeters(pos: LatLng, route: OfflineRouteOverlay): number | null {
  const geom = route.routeGeoJson.geometry

  const lines: number[][][] =
    geom.type === 'LineString'
      ? [geom.coordinates as number[][]]
      : geom.type === 'MultiLineString'
        ? (geom.coordinates as number[][][])
        : []

  let best: number | null = null

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = coordsToLatLng(line[i]!)
      const b = coordsToLatLng(line[i + 1]!)
      const d = distancePointToSegmentMeters(pos, a, b)
      if (best == null || d < best) best = d
    }
  }

  return best
}

export function offRouteWarning(params: {
  pos: LatLng
  route: OfflineRouteOverlay
  thresholdMeters: number
}): { offRoute: boolean; distanceMeters: number | null } {
  const d = distanceToRouteMeters(params.pos, params.route)
  if (d == null) return { offRoute: false, distanceMeters: null }
  return { offRoute: d > params.thresholdMeters, distanceMeters: d }
}
