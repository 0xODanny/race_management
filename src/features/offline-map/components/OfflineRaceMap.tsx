import { useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorEvent, LngLatLike, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useRaceStore } from '../../../state/raceStore'
import { getExpectedNext } from '../../../race/routeEngine'
import { useI18n } from '../../../i18n/i18n'
import type { LatLng, OfflineCheckpoint, OfflineEventMapPackage, OfflineRouteOverlay } from '../types'
import { listOfflineCheckpoints, getOfflineEventPackage, getOfflineRoute } from '../storage/offlineMapRepo'
import { useGeolocation } from '../hooks/useGeolocation'
import { offRouteWarning } from '../services/routeProximityService'
import { normalizeTileTemplateUrl } from '../utils/tiles'

let workerConfigured = false
function ensureMapLibreWorker() {
  if (workerConfigured) return
  // CSP/Brave-friendly worker bundle (avoids blob/eval worker creation).
  maplibregl.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-csp-worker.js', import.meta.url).toString())
  workerConfigured = true
}

function toLngLat(p: LatLng): LngLatLike {
  return [p.lon, p.lat]
}

function isMapUsable(map: MapLibreMap | null): map is MapLibreMap {
  if (!map) return false
  const m = map as unknown as { _removed?: boolean; style?: unknown }
  return !m._removed && !!m.style
}

function withStyleLoaded(map: MapLibreMap, cb: () => void): () => void {
  try {
    if (map.isStyleLoaded?.()) {
      cb()
      return () => {}
    }
  } catch {
    // fall through and attach load handler
  }

  const onLoad = () => {
    try {
      cb()
    } catch {
      // ignore
    }
  }

  map.once('load', onLoad)
  return () => {
    try {
      map.off('load', onLoad)
    } catch {
      // ignore
    }
  }
}

function approxTileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z)
  const latRad = (lat * Math.PI) / 180
  const n = Math.tan(Math.PI / 4 + latRad / 2)
  const y = Math.floor(((1 - Math.log(n) / Math.PI) / 2) * 2 ** z)
  return { x, y }
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

const OSM_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function isTilesProxyUrl(templateUrl: string): boolean {
  // Treat relative `/tiles/...` and absolute same-origin `/tiles/...` as proxy.
  try {
    const u = new URL(templateUrl, window.location.href)
    return u.origin === window.location.origin && u.pathname.startsWith('/tiles/')
  } catch {
    return templateUrl.startsWith('/tiles/')
  }
}

async function resolveTileTemplateUrl(params: {
  templateUrl: string
  center: LatLng
  minZoom: number
  maxZoom: number
}): Promise<string> {
  const { templateUrl, center, minZoom, maxZoom } = params
  const normalized = normalizeTileTemplateUrl(templateUrl)

  // If it's not our `/tiles` proxy, keep it.
  if (!isTilesProxyUrl(normalized)) return normalized

  // Probe one tile. If Vercel blocks `/tiles` with 403/challenge, fall back to direct OSM.
  try {
    const z = Math.min(Math.max(minZoom, 15), maxZoom)
    const { x, y } = approxTileXY(center.lat, center.lon, z)
    const url = new URL(`/tiles/${z}/${x}/${y}.png?probe=tilesProxy&t=${Date.now()}`, window.location.href).toString()
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status === 403) return OSM_TEMPLATE
  } catch {
    // If probe fails (offline/etc), keep original.
  }

  return normalized
}

function fillTileTemplate(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
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

function approxMetersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function canDecodeImage(blob: Blob): Promise<{ ok: boolean; width?: number; height?: number; error?: string }> {
  // A raster tile PNG can be very small if it compresses well; size is not a reliable validity check.
  // Prefer decoding the image.
  try {
    if (typeof createImageBitmap !== 'function') return { ok: true }
    const bmp = await createImageBitmap(blob)
    const width = (bmp as unknown as { width?: number }).width
    const height = (bmp as unknown as { height?: number }).height
    try {
      ;(bmp as unknown as { close?: () => void }).close?.()
    } catch {
      // ignore
    }
    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) return { ok: true, width, height }
    return { ok: false, error: 'decoded with invalid dimensions' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'decode failed' }
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
  const rafRef = useRef<number | null>(null)
  const initTimeoutRef = useRef<number | null>(null)
  const tileTimeoutRef = useRef<number | null>(null)
  const debugProbeTimeoutRef = useRef<number | null>(null)

  const [mapInitError, setMapInitError] = useState<string | null>(null)
  const mapInitErrorRef = useRef<string | null>(null)
  useEffect(() => {
    mapInitErrorRef.current = mapInitError
  }, [mapInitError])

  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).has('debugMap')
    } catch {
      return false
    }
  }, [])

  const [debugInfo, setDebugInfo] = useState<{
    mapLoaded: boolean | null
    tilesLoaded: boolean | null
    styleLoaded: boolean | null
    canvas: string
    canvasRect: string
    canvasCss: string
    canvases: string
    view: string
    container: string
    source: string
    webgl: string
    lastProbe: string | null
  } | null>(null)

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

  const lastFollowAtRef = useRef<number>(0)
  const lastFollowPosRef = useRef<LatLng | null>(null)

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

  // Keep the map canvas sized correctly (especially important in mobile Safari/Chrome and during layout changes).
  // Attach observer independent of map init timing; callback is a no-op until mapRef exists.
  useEffect(() => {
    let rafId: number | null = null
    let ro: ResizeObserver | null = null

    const attach = () => {
      const el = containerRef.current
      if (!el) {
        rafId = window.requestAnimationFrame(attach)
        return
      }

      ro = new ResizeObserver(() => {
        if (rafId) window.cancelAnimationFrame(rafId)
        rafId = window.requestAnimationFrame(() => {
          try {
            if (isMapUsable(mapRef.current)) mapRef.current.resize()
          } catch {
            // ignore
          }
        })
      })

      ro.observe(el)
    }

    rafId = window.requestAnimationFrame(attach)
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      try {
        ro?.disconnect()
      } catch {
        // ignore
      }
      ro = null
    }
  }, [])

  // Init map
  useEffect(() => {
    if (!containerRef.current) return
    if (!pkg) return
    if (mapRef.current) return

    const pkgSnapshot = pkg

    setMapInitError(null)
    let cancelled = false
    let detachCanvasListeners: (() => void) | null = null
    let detachDebug: (() => void) | null = null
    let clearTransientErrorIfHealthy: (() => void) | null = null

    const hasWebGL = () => {
      try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        return !!gl
      } catch {
        return false
      }
    }

    const init = () => {
      if (cancelled) return
      const el = containerRef.current
      if (!el) return

      // Wait for layout: MapLibre can misbehave if container is 0x0.
      if (el.clientWidth < 50 || el.clientHeight < 50) {
        rafRef.current = window.requestAnimationFrame(init)
        return
      }

      if (!hasWebGL()) {
        setMapInitError(
          tr({
            en: 'Map cannot load: WebGL is disabled/unavailable in this browser. Enable hardware acceleration (Chrome Settings → System) or try a different browser/device.',
            pt: 'O mapa não pode carregar: WebGL está desativado/indisponível neste navegador. Ative a aceleração de hardware (Configurações do Chrome → Sistema) ou tente outro navegador/dispositivo.',
          }),
        )
        return
      }

      ensureMapLibreWorker()

      try {
        let started = false

        const start = async () => {
          if (started || cancelled) return
          started = true

          const resolvedTemplate = await resolveTileTemplateUrl({
            templateUrl: pkgSnapshot.tileManifest.tileTemplateUrl,
            center: pkgSnapshot.center,
            minZoom: pkgSnapshot.minZoom,
            maxZoom: pkgSnapshot.maxZoom,
          })

          if (cancelled) return

          const map = new maplibregl.Map({
            container: el,
            style: buildRasterStyle(resolvedTemplate),
            center: toLngLat(pkgSnapshot.center),
            zoom: Math.min(Math.max(pkgSnapshot.minZoom, 14), pkgSnapshot.maxZoom),
            minZoom: pkgSnapshot.minZoom,
            maxZoom: pkgSnapshot.maxZoom,
            attributionControl: false,
          })

        // Some browsers (esp. mobile + safe-area) change layout in the first paint.
        // Force a resize/repaint on load + after a short tick.
        map.once('load', () => {
          try {
            map.resize()
            map.triggerRepaint()
          } catch {
            // ignore
          }

          window.setTimeout(() => {
            try {
              if (isMapUsable(mapRef.current)) {
                mapRef.current.resize()
                mapRef.current.triggerRepaint()
              }
            } catch {
              // ignore
            }
          }, 150)
        })

          map.addControl(new maplibregl.AttributionControl({ compact: true }))

          map.on('error', (e: ErrorEvent) => {
          // eslint-disable-next-line no-console
          console.error('MapLibre error', e?.error ?? e)
          const msg =
            e?.error && typeof e.error === 'object' && 'message' in e.error
              ? String((e.error as { message?: unknown }).message ?? '').trim()
              : ''
          setMapInitError(
            msg ||
              tr({
                en: 'Map error. If this persists, your browser may be blocking WebGL or workers.',
                pt: 'Erro no mapa. Se persistir, seu navegador pode estar bloqueando WebGL ou workers.',
              }),
          )
        })

          const canvas = map.getCanvas()

        const onContextLost = (evt: Event) => {
          try {
            ;(evt as unknown as { preventDefault?: () => void }).preventDefault?.()
          } catch {
            // ignore
          }
          setMapInitError(
            tr({
              en: 'Map cannot render: WebGL context was lost. Try reloading, enabling hardware acceleration, or switching browsers/devices.',
              pt: 'O mapa não pode renderizar: contexto WebGL foi perdido. Recarregue, ative aceleração de hardware ou troque de navegador/dispositivo.',
            }),
          )
        }

        const onContextCreationError = (evt: Event) => {
          const msg = String((evt as unknown as { statusMessage?: unknown }).statusMessage ?? '').trim()
          setMapInitError(
            msg ||
              tr({
                en: 'Map cannot render: failed to create a WebGL context. Enable hardware acceleration or try another browser/device.',
                pt: 'O mapa não pode renderizar: falha ao criar contexto WebGL. Ative aceleração de hardware ou tente outro navegador/dispositivo.',
              }),
          )
        }

          canvas.addEventListener('webglcontextlost', onContextLost as EventListener)
          canvas.addEventListener('webglcontextcreationerror', onContextCreationError as EventListener)

        detachCanvasListeners = () => {
          try {
            canvas.removeEventListener('webglcontextlost', onContextLost as EventListener)
            canvas.removeEventListener('webglcontextcreationerror', onContextCreationError as EventListener)
          } catch {
            // ignore
          }
        }

        // Watchdog: if the map never loads, surface a helpful message.
          initTimeoutRef.current = window.setTimeout(() => {
          if (!isMapUsable(mapRef.current)) return
          try {
            // `loaded()` can remain false for a while even if the map is already painting.
            // Only warn if the style itself isn't loaded.
            const styleOk = typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : true
            const loadedOk = typeof map.loaded === 'function' ? !!map.loaded() : true
            if (!styleOk && !loadedOk) {
              setMapInitError(
                tr({
                  en: 'Map did not finish loading. This is usually caused by blocked WebGL, blocked workers, or a GPU issue.',
                  pt: 'O mapa não terminou de carregar. Normalmente isso acontece por bloqueio de WebGL, bloqueio de workers ou problema de GPU.',
                }),
              )
            }
          } catch {
            // ignore
          }
          }, 8000)

        // Tile watchdog: catch the "white map, no errors" case.
        // If style loads but tiles never paint, probe a tile for the *current view*.
          tileTimeoutRef.current = window.setTimeout(() => {
          const m = mapRef.current
          if (!isMapUsable(m)) return

          try {
            const areTilesLoaded = typeof m.areTilesLoaded === 'function' ? m.areTilesLoaded() : null
            if (areTilesLoaded === true) return

            const c = m.getCenter()
            const z = Math.min(Math.max(pkgSnapshot.minZoom, Math.round(m.getZoom())), pkgSnapshot.maxZoom)
            const { x, y } = approxTileXY(c.lat, c.lng, z)
            const url = new URL(fillTileTemplate(resolvedTemplate, z, x, y), window.location.href)
            url.searchParams.set('watchdog', '1')
            url.searchParams.set('t', String(Date.now()))

            void (async () => {
              try {
                const res = await fetch(url.toString(), { cache: 'no-store' })
                const ct = (res.headers.get('content-type') || '').toLowerCase()
                const blob = await res.blob()

                if (!ct.includes('image/')) {
                  if (debugEnabled) {
                    setDebugInfo((prev) =>
                      prev
                        ? { ...prev, lastProbe: `probe: ${res.status} ${ct || 'no-ct'} ${blob.size} bytes (not image)` }
                        : {
                            mapLoaded: null,
                            tilesLoaded: null,
                            styleLoaded: null,
                            canvas: 'unknown',
                            canvasRect: 'unknown',
                            canvasCss: 'unknown',
                            canvases: 'unknown',
                            view: 'unknown',
                            container: 'unknown',
                            source: 'unknown',
                            webgl: 'unknown',
                            lastProbe: `probe: ${res.status} ${ct || 'no-ct'} ${blob.size} bytes (not image)`,
                          },
                    )
                  }
                  setMapInitError(
                    tr({
                      en: `Map tiles are not images (${res.status} ${ct || 'no-content-type'}, ${blob.size} bytes). This will render a blank map.`,
                      pt: `Tiles do mapa não são imagens (${res.status} ${ct || 'sem content-type'}, ${blob.size} bytes). Isso deixa o mapa em branco.`,
                    }),
                  )
                  return
                }

                const dec = await canDecodeImage(blob)
                if (!dec.ok) {
                  if (debugEnabled) {
                    setDebugInfo((prev) =>
                      prev
                        ? { ...prev, lastProbe: `probe: ${res.status} ${ct} ${blob.size} bytes (decode failed)` }
                        : {
                            mapLoaded: null,
                            tilesLoaded: null,
                            styleLoaded: null,
                            canvas: 'unknown',
                            canvasRect: 'unknown',
                            canvasCss: 'unknown',
                            canvases: 'unknown',
                            view: 'unknown',
                            container: 'unknown',
                            source: 'unknown',
                            webgl: 'unknown',
                            lastProbe: `probe: ${res.status} ${ct} ${blob.size} bytes (decode failed)`,
                          },
                    )
                  }
                  setMapInitError(
                    tr({
                      en: `Map tiles could not be decoded (${res.status} ${ct || 'no-content-type'}, ${blob.size} bytes). This can render a blank map.`,
                      pt: `Tiles do mapa não puderam ser decodificados (${res.status} ${ct || 'sem content-type'}, ${blob.size} bytes). Isso pode deixar o mapa em branco.`,
                    }),
                  )
                  return
                }

                if (debugEnabled) {
                  setDebugInfo((prev) =>
                    prev
                      ? { ...prev, lastProbe: `probe: ${res.status} ${ct} ${blob.size} bytes (image ok)` }
                      : {
                          mapLoaded: null,
                          tilesLoaded: null,
                          styleLoaded: null,
                          canvas: 'unknown',
                          canvasRect: 'unknown',
                          canvasCss: 'unknown',
                          canvases: 'unknown',
                          view: 'unknown',
                          container: 'unknown',
                          source: 'unknown',
                          webgl: 'unknown',
                          lastProbe: `probe: ${res.status} ${ct} ${blob.size} bytes (image ok)`,
                        },
                  )
                }

                // Tiles are reachable and valid, but nothing painted.
                // This points to WebGL/GPU/driver issues or a blocked worker.
                const canvas = m.getCanvas()
                const gl =
                  (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
                  ((canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null)
                const vendor = gl ? String(gl.getParameter(gl.VENDOR) ?? '') : ''
                const renderer = gl ? String(gl.getParameter(gl.RENDERER) ?? '') : ''

                setMapInitError(
                  tr({
                    en: `Tiles are reachable (${ct}, ${blob.size} bytes) but the map did not paint. This is usually a WebGL/GPU issue or blocked workers. ${vendor || renderer ? `WebGL: ${vendor} ${renderer}` : ''}`,
                    pt: `Tiles estão acessíveis (${ct}, ${blob.size} bytes) mas o mapa não renderizou. Normalmente é problema de WebGL/GPU ou bloqueio de workers. ${vendor || renderer ? `WebGL: ${vendor} ${renderer}` : ''}`,
                  }),
                )
              } catch (e) {
                const msg = e instanceof Error ? e.message : ''
                if (msg) setMapInitError(msg)
              }
            })()
          } catch {
            // ignore
          }
          }, 4500)

          mapRef.current = map

          // Auto-clear transient watchdog messages once we can tell the map is rendering.
          clearTransientErrorIfHealthy = () => {
          const err = mapInitErrorRef.current
          if (!err) return
          if (
            !(
              err.includes('Map did not finish loading') ||
              err.includes('Tiles are reachable') ||
              err.includes('Tiles estão acessíveis')
            )
          )
            return

          try {
            const canvas = map.getCanvas()
            const styleOk = typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : true
            if (styleOk && canvas.width > 0 && canvas.height > 0) setMapInitError(null)
          } catch {
            // ignore
          }
        }

          map.on('render', clearTransientErrorIfHealthy)
          map.on('load', clearTransientErrorIfHealthy)

          if (debugEnabled) {
          const update = () => {
            const m = mapRef.current
            if (!isMapUsable(m)) return
            try {
              const canvas = m.getCanvas()
              const container = containerRef.current
              const contRect = container?.getBoundingClientRect()

              const canvasRect = canvas.getBoundingClientRect()
              const canvasCss = (() => {
                try {
                  const s = window.getComputedStyle(canvas)
                  return `disp=${s.display} vis=${s.visibility} op=${s.opacity} pos=${s.position} z=${s.zIndex} tx=${s.transform === 'none' ? 'none' : 'xform'} mix=${s.mixBlendMode}`
                } catch {
                  return 'unknown'
                }
              })()

              const canvases = (() => {
                try {
                  return container ? `${container.querySelectorAll('canvas').length} canvas(es)` : 'unknown'
                } catch {
                  return 'unknown'
                }
              })()

              const source = (() => {
                try {
                  const style = m.getStyle?.()
                  const sources = style?.sources as Record<string, unknown> | undefined
                  const raster = sources?.raster as { tiles?: unknown } | undefined
                  const t = raster?.tiles
                  const first = Array.isArray(t) ? String(t[0] ?? '') : ''
                  return first || 'unknown'
                } catch {
                  return 'unknown'
                }
              })()

              const webgl = (() => {
                try {
                  const gl =
                    (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
                    ((canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null)
                  if (!gl) return 'no-context'

                  const px = new Uint8Array(4)
                  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)

                  const dbg = gl.getExtension('WEBGL_debug_renderer_info') as
                    | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number }
                    | null
                    | undefined
                  const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? '') : String(gl.getParameter(gl.VENDOR) ?? '')
                  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : String(gl.getParameter(gl.RENDERER) ?? '')
                  return `px=${Array.from(px).join(',')} ${vendor} ${renderer}`.trim()
                } catch {
                  return 'error'
                }
              })()

              const mm = m as unknown as {
                loaded?: () => unknown
                areTilesLoaded?: () => unknown
                isStyleLoaded?: () => unknown
              }

              const mapLoaded = typeof mm.loaded === 'function' ? !!mm.loaded() : null
              const tilesLoaded = typeof mm.areTilesLoaded === 'function' ? !!mm.areTilesLoaded() : null
              const styleLoaded = typeof mm.isStyleLoaded === 'function' ? !!mm.isStyleLoaded() : null

              // If a watchdog fired early but the map later loads, clear the transient message.
              // Keep real MapLibre errors.
              const err = mapInitErrorRef.current
              if (err && mapLoaded && styleLoaded && tilesLoaded) {
                if (
                  err.includes('Map did not finish loading') ||
                  err.includes('Tiles are reachable') ||
                  err.includes('Tiles estão acessíveis')
                ) {
                  setMapInitError(null)
                }
              }

              setDebugInfo((prev) => ({
                mapLoaded,
                tilesLoaded,
                styleLoaded,
                canvas: `${canvas.clientWidth}x${canvas.clientHeight} css, ${canvas.width}x${canvas.height} px`,
                canvasRect: `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)} rect @${Math.round(canvasRect.left)},${Math.round(canvasRect.top)}`,
                canvasCss,
                canvases,
                view: `z=${m.getZoom().toFixed(2)} center=${m.getCenter().lng.toFixed(5)},${m.getCenter().lat.toFixed(5)}`,
                container: contRect ? `${Math.round(contRect.width)}x${Math.round(contRect.height)} rect` : 'unknown',
                source,
                webgl,
                lastProbe: prev?.lastProbe ?? null,
              }))
            } catch {
              // ignore
            }
          }

          update()
          map.on('render', update)
          map.on('load', update)
          detachDebug = () => {
            try {
              map.off('render', update)
              map.off('load', update)
            } catch {
              // ignore
            }
          }

          // Always do an explicit probe in debug mode, even if tilesLoaded is true.
          // This proves whether the "200" responses are actually PNGs.
          debugProbeTimeoutRef.current = window.setTimeout(() => {
            const m = mapRef.current
            if (!isMapUsable(m)) return
            try {
              const c = m.getCenter()
              const z = Math.min(Math.max(pkgSnapshot.minZoom, Math.round(m.getZoom())), pkgSnapshot.maxZoom)
              const { x, y } = approxTileXY(c.lat, c.lng, z)
              const url = new URL(fillTileTemplate(resolvedTemplate, z, x, y), window.location.href)
              url.searchParams.set('debugProbe', '1')
              url.searchParams.set('t', String(Date.now()))
              void (async () => {
                try {
                  const res = await fetch(url.toString(), { cache: 'no-store' })
                  const ct = (res.headers.get('content-type') || '').toLowerCase()
                  const blob = await res.blob()
                  setDebugInfo((prev) =>
                    prev
                      ? { ...prev, lastProbe: `probe: ${res.status} ${ct || 'no-ct'} ${blob.size} bytes` }
                      : {
                          mapLoaded: null,
                          tilesLoaded: null,
                          styleLoaded: null,
                          canvas: 'unknown',
                          canvasRect: 'unknown',
                          canvasCss: 'unknown',
                          canvases: 'unknown',
                          view: 'unknown',
                          container: 'unknown',
                          source: 'unknown',
                          webgl: 'unknown',
                          lastProbe: `probe: ${res.status} ${ct || 'no-ct'} ${blob.size} bytes`,
                        },
                  )
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'probe error'
                  setDebugInfo((prev) => (prev ? { ...prev, lastProbe: msg } : prev))
                }
              })()
            } catch {
              // ignore
            }
          }, 1600)
        }

          // Probe a tile to detect cases where tiles return non-image content
        // (e.g. an HTML error page) which would render the map as blank white.
          void (async () => {
          try {
            const z = Math.min(Math.max(pkgSnapshot.minZoom, 15), pkgSnapshot.maxZoom)
            const { x, y } = approxTileXY(pkgSnapshot.center.lat, pkgSnapshot.center.lon, z)
              const probeUrl = new URL(fillTileTemplate(resolvedTemplate, z, x, y), window.location.href)
              probeUrl.searchParams.set('probe', '1')
              probeUrl.searchParams.set('t', String(Date.now()))
              const res = await fetch(probeUrl.toString(), { cache: 'no-store' })
            const ct = (res.headers.get('content-type') || '').toLowerCase()
            const blob = await res.blob()
            if (!ct.includes('image/')) {
              setMapInitError(
                tr({
                  en: `Tiles look invalid (${res.status} ${ct || 'no-content-type'}, ${blob.size} bytes). This will render a blank map.`,
                  pt: `Tiles parecem inválidos (${res.status} ${ct || 'sem content-type'}, ${blob.size} bytes). Isso deixa o mapa em branco.`,
                }),
              )
              return
            }

            const dec = await canDecodeImage(blob)
            if (!dec.ok) {
              setMapInitError(
                tr({
                  en: `Tiles could not be decoded (${res.status} ${ct || 'no-content-type'}, ${blob.size} bytes). This can render a blank map.`,
                  pt: `Tiles não puderam ser decodificados (${res.status} ${ct || 'sem content-type'}, ${blob.size} bytes). Isso pode deixar o mapa em branco.`,
                }),
              )
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : ''
            if (msg) setMapInitError(msg)
          }
          })()
        }

        // Kick off async start (style resolution + map creation).
        void start()
      } catch (e) {
        setMapInitError(e instanceof Error ? e.message : tr({ en: 'Map failed to initialize.', pt: 'Falha ao iniciar o mapa.' }))
      }
    }

    rafRef.current = window.requestAnimationFrame(init)

    return () => {
      cancelled = true
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      if (initTimeoutRef.current) {
        window.clearTimeout(initTimeoutRef.current)
        initTimeoutRef.current = null
      }

      if (tileTimeoutRef.current) {
        window.clearTimeout(tileTimeoutRef.current)
        tileTimeoutRef.current = null
      }

      if (debugProbeTimeoutRef.current) {
        window.clearTimeout(debugProbeTimeoutRef.current)
        debugProbeTimeoutRef.current = null
      }

      detachCanvasListeners?.()
      detachCanvasListeners = null

      detachDebug?.()
      detachDebug = null

      setDebugInfo(null)

      const map = mapRef.current
      try {
        if (map && clearTransientErrorIfHealthy) {
          try {
            map.off('render', clearTransientErrorIfHealthy)
            map.off('load', clearTransientErrorIfHealthy)
          } catch {
            // ignore
          }
        }
        map?.remove()
      } catch {
        // ignore
      }
      mapRef.current = null
    }
  }, [pkg, tr])

  // Route layer
  useEffect(() => {
    let cancelled = false

    async function add() {
      const map = mapRef.current
      if (!isMapUsable(map)) return

      const r = await getOfflineRoute(props.eventId)
      if (cancelled || !r) return

      setRoute(r)

      const detach = withStyleLoaded(map, () => {
        if (!isMapUsable(map)) return
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
      })

      if (cancelled) detach()
    }

    void add()

    return () => {
      cancelled = true
    }
  }, [props.eventId, pkg?.packageVersion])

  // Checkpoint markers
  useEffect(() => {
    const map = mapRef.current
    if (!isMapUsable(map)) return
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
    if (!isMapUsable(map)) return

    const posMarkerEl = document.createElement('div')
    posMarkerEl.style.width = '14px'
    posMarkerEl.style.height = '14px'
    posMarkerEl.style.borderRadius = '9999px'
    posMarkerEl.style.background = '#000000'
    posMarkerEl.style.border = '3px solid #ffffff'

    const posMarker = new maplibregl.Marker({ element: posMarkerEl, anchor: 'center' })

    const detachAccuracy = withStyleLoaded(map, () => {
      if (!isMapUsable(map)) return
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
    })

    const update = () => {
      if (!isMapUsable(map)) return
      if (!geo.fix) {
        posMarker.remove()
        const src = map.getSource('accuracy') as maplibregl.GeoJSONSource | undefined
        src?.setData(EMPTY_FC)
        return
      }

      posMarker.setLngLat([geo.fix.lon, geo.fix.lat]).addTo(map)

      if (follow) {
        // Throttle follow updates to avoid a constant move/cancel loop that prevents tiles from settling.
        const now = Date.now()
        const nextPos: LatLng = { lat: geo.fix.lat, lon: geo.fix.lon }
        const lastPos = lastFollowPosRef.current
        const moved = lastPos ? approxMetersBetween(lastPos, nextPos) : 999

        if (moved >= 8 && now - lastFollowAtRef.current >= 900) {
          lastFollowAtRef.current = now
          lastFollowPosRef.current = nextPos
          try {
            // If the map is already moving (e.g., due to GPS jitter), jumpTo is less disruptive than easeTo.
            const moving = typeof map.isMoving === 'function' ? map.isMoving() : false
            if (moving) map.jumpTo({ center: [geo.fix.lon, geo.fix.lat] })
            else map.easeTo({ center: [geo.fix.lon, geo.fix.lat], duration: 350 })
          } catch {
            // ignore
          }
        }
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
      detachAccuracy()
      posMarker.remove()
      if (!isMapUsable(map)) return
      try {
        if (map.getLayer('accuracy-fill')) map.removeLayer('accuracy-fill')
        if (map.getLayer('accuracy-outline')) map.removeLayer('accuracy-outline')
        if (map.getSource('accuracy')) map.removeSource('accuracy')
      } catch {
        // Map may have been removed between renders.
      }
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
      <div className="relative flex-1 min-h-0">
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

        {/* Important: keep the MapLibre container free of React children.
          React reconciliation can remove the map's injected canvas on re-render.
          Also: do NOT absolutely-position the container; we want it to participate in layout
          so it never collapses to 0 height (a common cause of white/blank maps). */}
        <div ref={containerRef} className="h-full w-full bg-zinc-100" />

        {debugEnabled && debugInfo ? (
          <div className="absolute bottom-3 left-3 z-10 max-w-[22rem] rounded-md border border-zinc-200 bg-white/95 p-2 text-[11px] font-semibold text-zinc-900">
            <div>
              loaded: {String(debugInfo.mapLoaded)} | style: {String(debugInfo.styleLoaded)} | tiles: {String(debugInfo.tilesLoaded)}
            </div>
            <div>container: {debugInfo.container}</div>
            <div>canvas: {debugInfo.canvas}</div>
            <div>canvasRect: {debugInfo.canvasRect}</div>
            <div>canvasCss: {debugInfo.canvasCss}</div>
            <div>canvases: {debugInfo.canvases}</div>
            <div>source: {debugInfo.source}</div>
            <div>webgl: {debugInfo.webgl}</div>
            <div>{debugInfo.view}</div>
            <div>probe: {debugInfo.lastProbe ?? '—'}</div>
          </div>
        ) : null}

        {mapInitError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-zinc-800">
            <div className="max-w-[26rem] rounded-lg border border-zinc-200 bg-white p-4">{mapInitError}</div>
          </div>
        ) : null}

        {!canShowMap ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-700">
            {tr({ en: 'Download the race map for offline use.', pt: 'Baixe o mapa da prova para uso offline.' })}
          </div>
        ) : null}

        {canShowMap && !route ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-zinc-700">
            {tr({ en: 'Loading route…', pt: 'Carregando percurso…' })}
          </div>
        ) : null}
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
