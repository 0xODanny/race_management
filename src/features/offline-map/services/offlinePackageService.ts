import { getSupabaseOrNull } from '../../../lib/supabase'
import { isTrialModeEnabled } from '../../../lib/demoMode'
import type { BoundingBox, OfflineCheckpoint, OfflineEventMapPackage, OfflineRouteOverlay } from '../types'
import { getOfflineRaceProgress } from '../storage/offlineMapRepo'
import { bboxCenter } from '../utils/geo'

function demoCenterForEvent(eventId: string) {
  if (eventId === 'demo-bra-florianopolis-10k') return { lat: -27.5949, lon: -48.5482 }
  if (eventId === 'demo-bra-serra-trail-21k') return { lat: -25.4284, lon: -49.2733 }
  if (eventId === 'demo-bra-chapada-ultra-55k') return { lat: -14.1402, lon: -47.5211 }
  return { lat: -25.4284, lon: -49.2733 }
}

function demoBbox(center: { lat: number; lon: number }): BoundingBox {
  const dLat = 0.02
  const dLon = 0.02
  return {
    west: center.lon - dLon,
    south: center.lat - dLat,
    east: center.lon + dLon,
    north: center.lat + dLat,
  }
}

function demoRoute(eventId: string, center: { lat: number; lon: number }): OfflineRouteOverlay {
  const pts: [number, number][] = [
    [center.lon - 0.012, center.lat - 0.01],
    [center.lon - 0.006, center.lat - 0.004],
    [center.lon - 0.002, center.lat + 0.002],
    [center.lon + 0.004, center.lat + 0.006],
    [center.lon + 0.01, center.lat + 0.002],
    [center.lon + 0.012, center.lat - 0.006],
  ]

  return {
    eventId,
    routeGeoJson: {
      type: 'Feature',
      properties: { eventId },
      geometry: { type: 'LineString', coordinates: pts },
    },
    updatedAt: Date.now(),
  }
}

function demoCheckpoints(eventId: string, center: { lat: number; lon: number }): OfflineCheckpoint[] {
  const points = [
    { checkpointId: 'cp_start', code: 'START', type: 'start' as const, off: [-0.012, -0.01] },
    { checkpointId: 'cp1', code: 'CP1', type: 'checkpoint' as const, off: [-0.006, -0.004] },
    { checkpointId: 'cp2', code: 'CP2', type: 'checkpoint' as const, off: [-0.002, 0.002] },
    { checkpointId: 'cp3', code: 'CP3', type: 'checkpoint' as const, off: [0.004, 0.006] },
    { checkpointId: 'cp4', code: 'CP4', type: 'checkpoint' as const, off: [0.01, 0.002] },
    { checkpointId: 'cp_fin', code: 'FIN', type: 'finish' as const, off: [0.012, -0.006] },
  ]

  return points.map((p, idx) => ({
    eventId,
    checkpointId: p.checkpointId,
    checkpointNumber: idx + 1,
    checkpointName: p.code,
    latitude: center.lat + p.off[1],
    longitude: center.lon + p.off[0],
    type: p.type,
    requiredSequenceOrder: idx + 1,
    radiusMeters: 30,
    description: p.type === 'checkpoint' ? 'Demo checkpoint' : undefined,
  }))
}

export async function fetchEventMapPackageMetadata(params: {
  eventId: string
  eventName: string
  venueName: string
}): Promise<OfflineEventMapPackage> {
  const now = Date.now()

  // Demo/local mode: provide a self-contained package without any backend calls.
  if (isTrialModeEnabled() || !getSupabaseOrNull()) {
    // Prefer last-known device GPS position so the offline download area matches where the user actually is.
    // This avoids confusing "outside downloaded map area" warnings when the demo event metadata is for a different city.
    let center = demoCenterForEvent(params.eventId)
    try {
      const progress = await getOfflineRaceProgress(params.eventId)
      const fix = progress?.lastKnownFix
      if (fix && typeof fix.lat === 'number' && typeof fix.lon === 'number') {
        center = { lat: fix.lat, lon: fix.lon }
      }
    } catch {
      // ignore
    }
    const bbox = demoBbox(center)
    const route = demoRoute(params.eventId, center)
    const checkpoints = demoCheckpoints(params.eventId, center)

    const minZoom = 13
    const maxZoom = 15

    return {
      eventId: params.eventId,
      eventName: params.eventName,
      venueName: params.venueName,
      packageVersion: 'demo-1',
      boundingBox: bbox,
      center: bboxCenter(bbox),
      minZoom,
      maxZoom,
      checkpoints,
      route,
      tileManifest: {
        eventId: params.eventId,
        packageVersion: 'demo-1',
        tileTemplateUrl: '/tiles/{z}/{x}/{y}.png',
        tileFormat: 'png',
        minZoom,
        maxZoom,
        boundingBox: bbox,
        approxBytes: 0,
        completedTileCount: 0,
        totalTileCount: 0,
      },
      downloadStatus: 'not_downloaded',
      readyOffline: false,
      createdAt: now,
      updatedAt: now,
    }
  }

  // Production path (backend-provided metadata). For now, this expects an Edge Function.
  // This is intentionally a thin wrapper so we can swap transport later.
  const supabase = getSupabaseOrNull()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.functions.invoke('event-map-package', {
    body: { eventId: params.eventId },
  })

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No map package returned')

  return data as OfflineEventMapPackage
}
