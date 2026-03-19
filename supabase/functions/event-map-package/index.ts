// @ts-nocheck
// Supabase Edge Function: event-map-package
// Returns the latest LIVE offline map package for an event (public readable).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Body = {
  eventId: string
}

type BBox = { west: number; south: number; east: number; north: number }

type OfflineCheckpointType = 'start' | 'checkpoint' | 'finish' | 'water' | 'hazard' | 'aid' | 'other'

type OfflineCheckpoint = {
  eventId: string
  checkpointId: string
  checkpointNumber: number
  checkpointName: string
  latitude: number
  longitude: number
  type: OfflineCheckpointType
  requiredSequenceOrder: number
  radiusMeters: number
  description?: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function bboxCenter(b: BBox) {
  return { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 }
}

function computeBboxFromCheckpoints(checkpoints: OfflineCheckpoint[], padDeg = 0.02): BBox {
  let west = 180
  let east = -180
  let south = 90
  let north = -90

  for (const c of checkpoints) {
    west = Math.min(west, c.longitude)
    east = Math.max(east, c.longitude)
    south = Math.min(south, c.latitude)
    north = Math.max(north, c.latitude)
  }

  if (!checkpoints.length) {
    return { west: -48.5482 - padDeg, east: -48.5482 + padDeg, south: -27.5949 - padDeg, north: -27.5949 + padDeg }
  }

  return {
    west: west - padDeg,
    east: east + padDeg,
    south: south - padDeg,
    north: north + padDeg,
  }
}

function routeFromCheckpoints(eventId: string, checkpoints: OfflineCheckpoint[]) {
  const ordered = checkpoints.slice().sort((a, b) => a.requiredSequenceOrder - b.requiredSequenceOrder)
  const coords = ordered.map((c) => [c.longitude, c.latitude])
  const safeCoords = coords.length >= 2 ? coords : coords.length === 1 ? [coords[0], coords[0]] : [[0, 0], [0, 0]]

  return {
    eventId,
    routeGeoJson: {
      type: 'Feature',
      properties: { eventId },
      geometry: {
        type: 'LineString',
        coordinates: safeCoords,
      },
    },
    updatedAt: Date.now(),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Public function: do not require auth.
  const sb = createClient(supabaseUrl, supabaseAnonKey)

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.eventId) return json(400, { error: 'Missing eventId' })

  const { data: event, error: eventErr } = await sb
    .from('events')
    .select('id,title,location')
    .eq('id', body.eventId)
    .maybeSingle()

  if (eventErr) return json(500, { error: eventErr.message })
  if (!event) return json(404, { error: 'Event not found' })

  const { data: opt, error: optErr } = await sb
    .from('event_map_options')
    .select('id,name,status,checkpoints,bounding_box,min_zoom,max_zoom,tile_template_url,updated_at')
    .eq('event_id', body.eventId)
    .eq('status', 'live')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (optErr) return json(500, { error: optErr.message })
  if (!opt) return json(404, { error: 'No live map option for event' })

  const checkpoints = (opt.checkpoints as any) as OfflineCheckpoint[]
  const bbox = (opt.bounding_box as any) as BBox | null
  const finalBbox = bbox && typeof bbox.west === 'number' ? bbox : computeBboxFromCheckpoints(checkpoints)
  const center = bboxCenter(finalBbox)

  const packageVersion = `${opt.id}-${new Date(opt.updated_at as any).getTime() || Date.now()}`

  const minZoom = typeof opt.min_zoom === 'number' ? opt.min_zoom : 13
  const maxZoom = typeof opt.max_zoom === 'number' ? opt.max_zoom : 15

  const now = Date.now()

  const pkg = {
    eventId: body.eventId,
    eventName: (event as any).title ?? 'Event',
    venueName: (event as any).location ?? '',
    packageVersion,

    boundingBox: finalBbox,
    center,

    minZoom,
    maxZoom,

    checkpoints,
    route: routeFromCheckpoints(body.eventId, checkpoints),

    tileManifest: {
      eventId: body.eventId,
      packageVersion,
      tileTemplateUrl: String(opt.tile_template_url ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
      tileFormat: 'png',
      minZoom,
      maxZoom,
      boundingBox: finalBbox,
      approxBytes: 0,
      completedTileCount: 0,
      totalTileCount: 0,
    },

    downloadStatus: 'not_downloaded',
    readyOffline: false,

    createdAt: now,
    updatedAt: now,
  }

  return json(200, pkg)
})
