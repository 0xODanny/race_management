import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap, type LngLatLike, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useRaceStore } from '../../../state/raceStore'
import { getExpectedNext } from '../../../race/routeEngine'
import { useI18n } from '../../../i18n/i18n'
import type { LatLng, OfflineCheckpoint, OfflineEventMapPackage, OfflineRouteOverlay } from '../types'
import { listOfflineCheckpoints, getOfflineEventPackage, getOfflineRoute } from '../storage/offlineMapRepo'
import { useGeolocation } from '../hooks/useGeolocation'
import { offRouteWarning } from '../services/routeProximityService'
import { normalizeTileTemplateUrl } from '../utils/tiles'

function toLngLat(p: LatLng): LngLatLike {
  return [p.lon, p.lat]
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function buildRasterStyle(tileTemplateUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles: [tileTemplateUrl],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
  }
}

function createCheckpointEl(cp: OfflineCheckpoint, state: 'next' | 'done' | 'pending') {
  const el = document.createElement('div')
  el.style.width = '32px'
  el.style.height = '32px'
  el.style.borderRadius = '9999px'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.fontWeight = '800'
  el.style.fontSize = '12px'
  el.style.boxSizing = 'border-box'
  el.style.border = state === 'next' ? '4px solid rgba(0,0,0,0.85)' : '2px solid rgba(0,0,0,0.6)'
  el.style.background = state === 'done' ? '#000000' : '#ffffff'
  el.style.color = state === 'done' ? '#ffffff' : '#000000'

  el.textContent = String(cp.checkpointNumber)
  el.title = cp.checkpointName
  return el
}

function makeCircleGeoJson(center: LatLng, radiusMeters: number, steps = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const latRad = (center.lat * Math.PI) / 180
  const mPerDegLat = 111132.92
  const mPerDegLon = 111412.84 * Math.cos(latRad)

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const dx = Math.cos(a) * radiusMeters
    const dy = Math.sin(a) * radiusMeters
    const lon = center.lon + dx / mPerDegLon
    const lat = center.lat + dy / mPerDegLat
    coords.push([lon, lat])
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
  }
}

function isInBbox(p: LatLng, bbox: { west: number; south: number; east: number; north: number }, padDeg = 0): boolean {
  return (
    p.lon >= bbox.west - padDeg &&
    p.lon <= bbox.east + padDeg &&
    p.lat >= bbox.south - padDeg &&
    p.lat <= bbox.north + padDeg
  )
}

export function OfflineRaceMap(props: { eventId: string; heightClass?: string }) {
  const { tr } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  const activePackage = useRaceStore((s) => s.activePackage)
  const activeSession = useRaceStore((s) => s.activeSession)

  const expectedNext = useMemo(() => {
    if (!activePackage || !activeSession) return null
    return getExpectedNext(activePackage.route, activeSession.progress)
  }, [activePackage, activeSession])

  const completedIds = useMemo(() => new Set(activeSession?.progress.completedCheckpointIds ?? []), [activeSession?.progress.completedCheckpointIds])

  const [pkg, setPkg] = useState<OfflineEventMapPackage | null>(null)
  const [checkpoints, setCheckpoints] = useState<OfflineCheckpoint[]>([])
  const [route, setRoute] = useState<OfflineRouteOverlay | null>(null)

  const [follow, setFollow] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)

  const geo = useGeolocation({ eventId: props.eventId, enabled: true, highAccuracy: true })

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const p = await getOfflineEventPackage(props.eventId)
      const cps = await listOfflineCheckpoints(props.eventId)
      const r = await getOfflineRoute(props.eventId)
      if (cancelled) return
      setPkg(p)
      setCheckpoints(cps.sort((a, b) => a.requiredSequenceOrder - b.requiredSequenceOrder))
      setRoute(r)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [props.eventId])

  // Init map
  useEffect(() => {
    if (!containerRef.current) return
    if (!pkg) return
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildRasterStyle(normalizeTileTemplateUrl(pkg.tileManifest.tileTemplateUrl)),
      center: toLngLat(pkg.center),
      zoom: Math.min(Math.max(pkg.minZoom, 14), pkg.maxZoom),
      minZoom: pkg.minZoom,
      maxZoom: pkg.maxZoom,
      attributionControl: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }))

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [pkg])

  // Route layer
  useEffect(() => {
    let cancelled = false

    async function add() {
      const map = mapRef.current
      if (!map) return

      const r = await getOfflineRoute(props.eventId)
      if (cancelled || !r) return

      setRoute(r)

      if (!map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: r.routeGeoJson })
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': '#000000',
            'line-width': 4,
            'line-opacity': 0.85,
          },
        })
      } else {
        const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
        src?.setData(r.routeGeoJson)
      }
    }

    void add()

    return () => {
      cancelled = true
    }
  }, [props.eventId, pkg?.packageVersion])

  // Checkpoint markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!checkpoints.length) return

    const markers: maplibregl.Marker[] = []

    for (const cp of checkpoints) {
      const state: 'next' | 'done' | 'pending' = completedIds.has(cp.checkpointId)
        ? 'done'
        : expectedNext?.checkpointId === cp.checkpointId
          ? 'next'
          : 'pending'

      const el = createCheckpointEl(cp, state)
      const m = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([cp.longitude, cp.latitude])
        .addTo(map)
      markers.push(m)
    }

    return () => {
      for (const m of markers) m.remove()
    }
  }, [checkpoints, completedIds, expectedNext?.checkpointId])

  // GPS marker + accuracy circle
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const posMarkerEl = document.createElement('div')
    posMarkerEl.style.width = '14px'
    posMarkerEl.style.height = '14px'
    posMarkerEl.style.borderRadius = '9999px'
    posMarkerEl.style.background = '#000000'
    posMarkerEl.style.border = '3px solid #ffffff'

    const posMarker = new maplibregl.Marker({ element: posMarkerEl, anchor: 'center' })

    const ensureAccuracy = () => {
      if (!map.getSource('accuracy')) {
        map.addSource('accuracy', {
          type: 'geojson',
          data: EMPTY_FC,
        })
        map.addLayer({
          id: 'accuracy-fill',
          type: 'fill',
          source: 'accuracy',
          paint: { 'fill-color': '#000000', 'fill-opacity': 0.08 },
        })
        map.addLayer({
          id: 'accuracy-outline',
          type: 'line',
          source: 'accuracy',
          paint: { 'line-color': '#000000', 'line-width': 2, 'line-opacity': 0.25 },
        })
      }
    }

    ensureAccuracy()

    const update = () => {
      if (!geo.fix) {
        posMarker.remove()
        const src = map.getSource('accuracy') as maplibregl.GeoJSONSource | undefined
        src?.setData(EMPTY_FC)
        return
      }

      posMarker.setLngLat([geo.fix.lon, geo.fix.lat]).addTo(map)

      if (follow) {
        map.easeTo({ center: [geo.fix.lon, geo.fix.lat], duration: 400 })
      }

      const acc = geo.fix.accuracyMeters
      if (typeof acc === 'number' && acc > 0) {
        const circle = makeCircleGeoJson({ lat: geo.fix.lat, lon: geo.fix.lon }, Math.min(250, acc))
        const src = map.getSource('accuracy') as maplibregl.GeoJSONSource | undefined
        src?.setData(circle)
      } else {
        const src = map.getSource('accuracy') as maplibregl.GeoJSONSource | undefined
        src?.setData(EMPTY_FC)
      }
    }

    update()

    return () => {
      posMarker.remove()
      if (map.getLayer('accuracy-fill')) map.removeLayer('accuracy-fill')
      if (map.getLayer('accuracy-outline')) map.removeLayer('accuracy-outline')
      if (map.getSource('accuracy')) map.removeSource('accuracy')
    }
  }, [geo.fix, follow])

  const offRouteState = useMemo(() => {
    if (!geo.fix || !route) return null
    if (geo.stale) return { kind: 'stale' as const }
    if (pkg?.boundingBox && !isInBbox({ lat: geo.fix.lat, lon: geo.fix.lon }, pkg.boundingBox, 0.001)) {
      return { kind: 'outside' as const }
    }
    const r = offRouteWarning({ pos: { lat: geo.fix.lat, lon: geo.fix.lon }, route, thresholdMeters: 60 })
    return { kind: 'route' as const, ...r }
  }, [geo.fix, geo.stale, route, pkg?.boundingBox])

  const gpsBadge =
    geo.status === 'active'
      ? geo.stale
        ? tr({ en: 'GPS STALE', pt: 'GPS DESATUALIZADO' })
        : tr({ en: 'GPS ACTIVE', pt: 'GPS ATIVO' })
      : geo.status === 'searching'
        ? tr({ en: 'GPS SEARCHING', pt: 'PROCURANDO GPS' })
        : geo.status === 'denied'
          ? tr({ en: 'GPS DENIED', pt: 'GPS NEGADO' })
          : tr({ en: 'GPS UNAVAILABLE', pt: 'GPS INDISPONÍVEL' })

  const gpsBadgeClass =
    geo.status === 'active' && !geo.stale
      ? 'bg-lime-500 text-black'
      : geo.status === 'searching'
        ? 'bg-white/10 text-white'
        : 'bg-red-600 text-white'

  const canShowMap = !!pkg
  const heightClass = props.heightClass ?? 'h-[70vh]'

  return (
    <div className={heightClass + ' relative flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white'}>
      <div className="relative flex-1">
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <div className={'rounded-full px-3 py-1 text-xs font-bold ' + gpsBadgeClass}>
            {gpsBadge}
            {geo.fix?.accuracyMeters ? <span className="ml-2 font-semibold">±{Math.round(geo.fix.accuracyMeters)}m</span> : null}
          </div>
          {!online ? (
            <div className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">{tr({ en: 'OFFLINE', pt: 'OFFLINE' })}</div>
          ) : null}
          {pkg?.readyOffline ? (
            <div className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">{tr({ en: 'MAP READY', pt: 'MAPA PRONTO' })}</div>
          ) : (
            <div className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-bold text-zinc-800">{tr({ en: 'MAP NOT READY', pt: 'MAPA NÃO PRONTO' })}</div>
          )}
        </div>

        {offRouteState?.kind === 'route' && offRouteState.offRoute ? (
          <div className="absolute left-3 right-3 top-14 z-10 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white">
            {tr({ en: 'You may be off course', pt: 'Você pode estar fora do percurso' })}
            {typeof offRouteState.distanceMeters === 'number' ? ` (≈${Math.round(offRouteState.distanceMeters)}m)` : ''}
          </div>
        ) : offRouteState?.kind === 'outside' ? (
          <div className="absolute left-3 right-3 top-14 z-10 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-black">
            {tr({ en: 'You are outside the downloaded map area.', pt: 'Você está fora da área do mapa baixado.' })}
          </div>
        ) : null}

        <div className="absolute bottom-3 right-3 z-10 grid gap-2">
          <button
            type="button"
            className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white"
            onClick={() => {
              const map = mapRef.current
              if (!map) return
              if (geo.fix) map.easeTo({ center: [geo.fix.lon, geo.fix.lat], zoom: Math.max(map.getZoom(), 15) })
            }}
          >
            {tr({ en: 'Center on me', pt: 'Centralizar em mim' })}
          </button>
          <button
            type="button"
            className={
              'rounded-md px-3 py-2 text-sm font-semibold ' +
              (follow ? 'bg-white text-black border border-zinc-300' : 'bg-black text-white')
            }
            onClick={() => setFollow((v) => !v)}
          >
            {follow ? tr({ en: 'Following', pt: 'Seguindo' }) : tr({ en: 'Follow', pt: 'Seguir' })}
          </button>
        </div>

        <div ref={containerRef} className="absolute inset-0 w-full bg-zinc-100">
          {!canShowMap ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-700">
              {tr({ en: 'Download the race map for offline use.', pt: 'Baixe o mapa da prova para uso offline.' })}
            </div>
          ) : null}
          {canShowMap && !route ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-zinc-700">
              {tr({ en: 'Loading route…', pt: 'Carregando percurso…' })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-white p-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{tr({ en: 'Next checkpoint', pt: 'Próximo checkpoint' })}</div>
          <div className="font-bold">{expectedNext?.code ?? '—'}</div>
        </div>
      </div>
    </div>
  )
}
