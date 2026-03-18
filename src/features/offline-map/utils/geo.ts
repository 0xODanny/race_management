import type { LatLng } from '../types'

// Lightweight helpers (avoid large geo deps for MVP).

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const s1 = Math.sin(dLat / 2)
  const s2 = Math.sin(dLon / 2)
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Approximate distance from a point to a polyline segment (meters) using an equirectangular projection.
export function distancePointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  // Project to meters in local tangent plane at p.
  const toRad = (d: number) => (d * Math.PI) / 180
  const latRad = toRad(p.lat)
  const mPerDegLat = 111132.92
  const mPerDegLon = 111412.84 * Math.cos(latRad)

  const ax = (a.lon - p.lon) * mPerDegLon
  const ay = (a.lat - p.lat) * mPerDegLat
  const bx = (b.lon - p.lon) * mPerDegLon
  const by = (b.lat - p.lat) * mPerDegLat

  const px = 0
  const py = 0

  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay

  const denom = abx * abx + aby * aby
  const t = denom > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom)) : 0
  const cx = ax + t * abx
  const cy = ay + t * aby

  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

export function bboxCenter(bbox: { west: number; south: number; east: number; north: number }): LatLng {
  return { lat: (bbox.north + bbox.south) / 2, lon: (bbox.west + bbox.east) / 2 }
}
