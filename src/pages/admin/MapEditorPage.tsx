import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useI18n } from '../../i18n/i18n'
import type { OfflineCheckpoint, OfflineCheckpointType } from '../../features/offline-map/types'

let workerConfigured = false
function ensureMapLibreWorker() {
  if (workerConfigured) return
  maplibregl.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-csp-worker.js', import.meta.url).toString())
  workerConfigured = true
}

type Waymark = {
  id: string
  code: string
  type: 'start' | 'finish' | 'checkpoint'
  lat: number
  lon: number
}

function normalizeEventId(v: string) {
  return v.trim()
}

function createWaymarkEl(label: string, kind: Waymark['type']) {
  const el = document.createElement('div')
  el.style.width = '34px'
  el.style.height = '34px'
  el.style.borderRadius = '9999px'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.fontWeight = '800'
  el.style.fontSize = '12px'
  el.style.boxSizing = 'border-box'
  el.style.border = '3px solid rgba(0,0,0,0.75)'
  el.style.background = '#ffffff'
  el.style.color = '#000000'
  el.title = kind
  el.textContent = label
  return el
}

function nextCpNumber(existing: Waymark[]) {
  let max = 0
  for (const w of existing) {
    const m = /^CP(\d+)$/.exec(w.code)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return max + 1
}

function toOfflineCheckpoints(eventId: string, waymarks: Waymark[]): OfflineCheckpoint[] {
  const start = waymarks.find((w) => w.type === 'start')
  const finish = waymarks.find((w) => w.type === 'finish')
  const cps = waymarks
    .filter((w) => w.type === 'checkpoint')
    .slice()
    .sort((a, b) => {
      const na = Number(/^CP(\d+)$/.exec(a.code)?.[1] ?? 0)
      const nb = Number(/^CP(\d+)$/.exec(b.code)?.[1] ?? 0)
      return na - nb
    })

  const ordered: Waymark[] = []
  if (start) ordered.push(start)
  ordered.push(...cps)
  if (finish) ordered.push(finish)

  return ordered.map((w, idx) => {
    const checkpointId =
      w.type === 'start'
        ? 'cp_start'
        : w.type === 'finish'
          ? 'cp_fin'
          : `cp${String(/^CP(\d+)$/.exec(w.code)?.[1] ?? idx + 1)}`

    const checkpointName = w.type === 'start' ? 'START' : w.type === 'finish' ? 'FIN' : w.code
    const type: OfflineCheckpointType = w.type

    return {
      eventId,
      checkpointId,
      checkpointNumber: idx + 1,
      checkpointName,
      latitude: w.lat,
      longitude: w.lon,
      type,
      requiredSequenceOrder: idx + 1,
      radiusMeters: 30,
      description: undefined,
    }
  })
}

export function MapEditorPage() {
  const { eventId: eventIdParam } = useParams()
  const [eventIdInput, setEventIdInput] = useState(eventIdParam ?? '')
  const eventId = normalizeEventId(eventIdParam ?? eventIdInput)

  const navigate = useNavigate()
  const { tr } = useI18n()

  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const [mode, setMode] = useState<'start' | 'finish' | 'checkpoint' | 'pan'>('checkpoint')
  const modeRef = useRef<'start' | 'finish' | 'checkpoint' | 'pan'>(mode)
  const [waymarks, setWaymarks] = useState<Waymark[]>([])

  const [placeQuery, setPlaceQuery] = useState('')
  const [placeBusy, setPlaceBusy] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [placeResults, setPlaceResults] = useState<Array<{ displayName: string; lat: number; lon: number; bbox?: [number, number, number, number] }>>([])

  const [coordText, setCoordText] = useState('')

  const goTo = (params: { lat: number; lon: number; bbox?: [number, number, number, number] }) => {
    const map = mapRef.current
    if (!map) return
    if (params.bbox) {
      const [south, north, west, east] = params.bbox
      const b = new maplibregl.LngLatBounds([west, south], [east, north])
      map.fitBounds(b, { padding: 60, maxZoom: 16 })
      return
    }
    map.flyTo({ center: [params.lon, params.lat], zoom: Math.max(map.getZoom(), 14) })
  }

  const parseCoords = (raw: string): { lat: number; lon: number } | null => {
    const t = raw.trim()
    if (!t) return null
    const parts = t
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length < 2) return null
    const a = Number(parts[0])
    const b = Number(parts[1])
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null

    // Heuristic: if first looks like lon,lat (|a| > 90), swap.
    let lat = a
    let lon = b
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
      lon = a
      lat = b
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return { lat, lon }
  }

  const searchPlace = async () => {
    const q = placeQuery.trim()
    if (!q) return
    setPlaceBusy(true)
    setPlaceError(null)
    setPlaceResults([])
    try {
      // Minimal OSM Nominatim search (good enough for cities/areas).
      // If this ever gets blocked/rate-limited, we can move this to a server-side proxy.
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'json')
      url.searchParams.set('q', q)
      url.searchParams.set('limit', '5')
      url.searchParams.set('addressdetails', '0')
      url.searchParams.set('bounded', '0')

      const res = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
        },
      })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = (await res.json().catch(() => null)) as any
      if (!Array.isArray(data)) throw new Error('Unexpected response')

      const parsed = data
        .map((r: any) => {
          const lat = Number(r.lat)
          const lon = Number(r.lon)
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
          const bboxRaw = r.boundingbox
          const bbox =
            Array.isArray(bboxRaw) && bboxRaw.length === 4
              ? ([Number(bboxRaw[0]), Number(bboxRaw[1]), Number(bboxRaw[2]), Number(bboxRaw[3])] as [number, number, number, number])
              : undefined
          return {
            displayName: String(r.display_name ?? `${lat}, ${lon}`),
            lat,
            lon,
            bbox:
              bbox && bbox.every((n) => Number.isFinite(n))
                ? bbox
                : undefined,
          }
        })
        .filter(Boolean) as Array<{ displayName: string; lat: number; lon: number; bbox?: [number, number, number, number] }>

      setPlaceResults(parsed)
      if (parsed[0]) goTo(parsed[0])
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setPlaceBusy(false)
    }
  }

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const exportJson = useMemo(() => {
    if (!eventId) return ''
    const cps = toOfflineCheckpoints(eventId, waymarks)
    return JSON.stringify({ eventId, checkpoints: cps }, null, 2)
  }, [eventId, waymarks])

  useEffect(() => {
    ensureMapLibreWorker()
    const el = mapDivRef.current
    if (!el) return
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: el,
      center: [-48.5482, -27.5949],
      zoom: 14,
      minZoom: 3,
      maxZoom: 19,
      style: {
        version: 8,
        sources: {
          raster: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'raster',
            type: 'raster',
            source: 'raster',
          },
        ],
      },
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right')

    const ro = new ResizeObserver(() => {
      try {
        map.resize()
      } catch {
        // ignore
      }
    })
    ro.observe(el)

    map.on('click', (e) => {
      const currentMode = modeRef.current
      if (currentMode === 'pan') return

      const lat = e.lngLat.lat
      const lon = e.lngLat.lng

      setWaymarks((prev) => {
        if (currentMode === 'start') {
          const rest = prev.filter((w) => w.type !== 'start')
          return [...rest, { id: 'start', code: 'START', type: 'start', lat, lon }]
        }
        if (currentMode === 'finish') {
          const rest = prev.filter((w) => w.type !== 'finish')
          return [...rest, { id: 'finish', code: 'FIN', type: 'finish', lat, lon }]
        }

        const n = nextCpNumber(prev)
        const code = `CP${n}`
        return [...prev, { id: code.toLowerCase(), code, type: 'checkpoint', lat, lon }]
      })
    })

    mapRef.current = map

    return () => {
      try {
        ro.disconnect()
      } catch {
        // ignore
      }
      try {
        map.remove()
      } catch {
        // ignore
      }
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers: maplibregl.Marker[] = []

    for (const w of waymarks) {
      const label = w.type === 'start' ? 'S' : w.type === 'finish' ? 'F' : w.code
      const el = createWaymarkEl(label, w.type)
      const m = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat([w.lon, w.lat])
        .addTo(map)

      m.on('dragend', () => {
        const ll = m.getLngLat()
        setWaymarks((prev) => prev.map((p) => (p.id === w.id ? { ...p, lat: ll.lat, lon: ll.lng } : p)))
      })

      markers.push(m)
    }

    return () => {
      for (const m of markers) {
        try {
          m.remove()
        } catch {
          // ignore
        }
      }
    }
  }, [waymarks])

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{tr({ en: 'Map waymark editor', pt: 'Editor de waymarks do mapa' })}</h1>
            <p className="mt-2 text-sm text-zinc-700">
              {tr({
                en: 'Click on the map to place START/FINISH/CPs. Drag markers to fine-tune. Export JSON to publish later.',
                pt: 'Clique no mapa para colocar LARGADA/CHEGADA/CPs. Arraste os marcadores para ajustar. Exporte o JSON para publicar depois.',
              })}
            </p>
          </div>
          <Link to="/admin" className="text-sm underline">
            {tr({ en: 'Back', pt: 'Voltar' })}
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">{tr({ en: 'Event ID', pt: 'ID do evento' })}</label>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                value={eventIdInput}
                onChange={(e) => setEventIdInput(e.target.value)}
                placeholder="demo-bra-florianopolis-10k"
              />
              <button
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                onClick={() => {
                  const v = normalizeEventId(eventIdInput)
                  if (!v) return
                  navigate(`/admin/map-editor/${encodeURIComponent(v)}`)
                }}
              >
                {tr({ en: 'Open', pt: 'Abrir' })}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{tr({ en: 'Place mode', pt: 'Modo de marcação' })}</label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="checkpoint">{tr({ en: 'Add next CP', pt: 'Adicionar próximo CP' })}</option>
              <option value="start">{tr({ en: 'Set START', pt: 'Definir LARGADA' })}</option>
              <option value="finish">{tr({ en: 'Set FINISH', pt: 'Definir CHEGADA' })}</option>
              <option value="pan">{tr({ en: 'Pan only', pt: 'Somente navegar' })}</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">{tr({ en: 'Search city / place', pt: 'Buscar cidade / local' })}</label>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="Florianópolis, Brazil"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchPlace()
                }}
              />
              <button
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                onClick={() => void searchPlace()}
                disabled={placeBusy}
              >
                {placeBusy ? tr({ en: 'Searching…', pt: 'Buscando…' }) : tr({ en: 'Search', pt: 'Buscar' })}
              </button>
            </div>
            {placeError ? <div className="mt-1 text-xs text-red-700">{placeError}</div> : null}
            {placeResults.length ? (
              <div className="mt-2 text-xs text-zinc-700">
                {placeResults.map((r) => (
                  <button
                    key={`${r.lat},${r.lon}`}
                    className="block w-full truncate rounded-md border border-zinc-200 bg-white px-2 py-1 text-left hover:bg-zinc-50"
                    onClick={() => goTo(r)}
                    title={r.displayName}
                  >
                    {r.displayName}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium">{tr({ en: 'Go to coordinates', pt: 'Ir para coordenadas' })}</label>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                value={coordText}
                onChange={(e) => setCoordText(e.target.value)}
                placeholder="-27.5949, -48.5482"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const parsed = parseCoords(coordText)
                    if (parsed) goTo(parsed)
                  }
                }}
              />
              <button
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                onClick={() => {
                  const parsed = parseCoords(coordText)
                  if (parsed) goTo(parsed)
                }}
              >
                {tr({ en: 'Go', pt: 'Ir' })}
              </button>
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              {tr({
                en: 'Paste “lat, lon” or “lon, lat”. Use the zoom buttons on the map to zoom out/in.',
                pt: 'Cole “lat, lon” ou “lon, lat”. Use os botões de zoom do mapa para afastar/aproximar.',
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            onClick={() => setWaymarks([])}
          >
            {tr({ en: 'Clear all', pt: 'Limpar tudo' })}
          </button>
          <button
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            onClick={() => {
              const start = waymarks.find((w) => w.type === 'start')
              const finish = waymarks.find((w) => w.type === 'finish')
              if (!start || !finish) return
              const map = mapRef.current
              if (!map) return
              const b = new maplibregl.LngLatBounds([start.lon, start.lat], [finish.lon, finish.lat])
              map.fitBounds(b, { padding: 80, maxZoom: 16 })
            }}
            title={tr({
              en: 'Zoom to START/FINISH (if both exist)',
              pt: 'Zoom para LARGADA/CHEGADA (se existirem)',
            })}
          >
            {tr({ en: 'Fit S/F', pt: 'Enquadrar S/F' })}
          </button>
          <button
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            onClick={async () => {
              try {
                if (!exportJson) return
                await navigator.clipboard.writeText(exportJson)
              } catch {
                // ignore
              }
            }}
          >
            {tr({ en: 'Copy JSON', pt: 'Copiar JSON' })}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex min-h-[65vh] flex-col">
          <div className="flex-1 min-h-0">
            <div ref={mapDivRef} className="h-full min-h-[55vh] w-full rounded-md border border-zinc-200" />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="text-sm font-semibold">{tr({ en: 'Waymarks', pt: 'Waymarks' })}</div>
              {waymarks.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {waymarks
                    .slice()
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-2">
                        <div className="truncate">
                          <span className="font-semibold">{w.code}</span>{' '}
                          <span className="text-zinc-600">({w.lat.toFixed(5)},{' '}{w.lon.toFixed(5)})</span>
                        </div>
                        <button
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                          onClick={() => setWaymarks((prev) => prev.filter((p) => p.id !== w.id))}
                        >
                          {tr({ en: 'Remove', pt: 'Remover' })}
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-zinc-600">
                  {tr({ en: 'No waymarks yet. Click the map to add CPs.', pt: 'Sem waymarks ainda. Clique no mapa para adicionar CPs.' })}
                </div>
              )}
            </div>

            <div className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="text-sm font-semibold">{tr({ en: 'Export', pt: 'Exportar' })}</div>
              <textarea
                className="mt-2 h-48 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs"
                readOnly
                value={exportJson}
                placeholder="{ ... }"
              />
              <div className="mt-2 text-xs text-zinc-600">
                {tr({
                  en: 'Next step: publish this JSON to Supabase so athletes downloading the map get the new START/FIN/CPs immediately.',
                  pt: 'Próximo passo: publicar este JSON no Supabase para que atletas baixando o mapa recebam os novos waymarks imediatamente.',
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
