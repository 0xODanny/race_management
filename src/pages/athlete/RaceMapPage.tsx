import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OfflineRaceMap } from '../../features/offline-map/components/OfflineRaceMap'
import { useRaceStore } from '../../state/raceStore'
import { useI18n } from '../../i18n/i18n'
import { Button } from '../../ui/Button'
import type { OfflineEventMapPackage } from '../../features/offline-map/types'
import {
  deleteOfflineEventPackage,
  getOfflineEventPackage,
  listOfflineTileMetadata,
  putOfflineCheckpoints,
  putOfflineRoute,
  upsertOfflineEventPackage,
} from '../../features/offline-map/storage/offlineMapRepo'
import {
  deleteOfflineTilesForPackage,
  downloadOfflineMapPackage,
  estimatePackageBytes,
  estimatePackageTileCount,
} from '../../features/offline-map/services/tileDownloadService'
import { fetchEventMapPackageMetadata } from '../../features/offline-map/services/offlinePackageService'

export function RaceMapPage() {
  const nav = useNavigate()
  const { tr } = useI18n()

  const pkg = useRaceStore((s) => s.activePackage)
  const eventId = useMemo(() => pkg?.eventId ?? null, [pkg?.eventId])

  const [offlinePkg, setOfflinePkg] = useState<OfflineEventMapPackage | null>(null)
  const [downloading, setDownloading] = useState<{ completed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = eventId
    if (!id) return
    const eventIdStr: string = id
    let cancelled = false
    async function load() {
      const p = await getOfflineEventPackage(eventIdStr)
      if (cancelled) return
      setOfflinePkg(p)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function refreshOfflinePkg(id: string) {
    const p = await getOfflineEventPackage(id)
    setOfflinePkg(p)
  }

  async function ensureMapMetadata() {
    if (!eventId) throw new Error('Missing event')
    const existing = await getOfflineEventPackage(eventId)
    if (existing) return existing
    if (!pkg) throw new Error('Missing race package')

    const meta = await fetchEventMapPackageMetadata({
      eventId,
      eventName: pkg.eventTitle,
      venueName: '',
    })
    await upsertOfflineEventPackage(meta)
    await refreshOfflinePkg(eventId)
    return meta
  }

  async function downloadMap() {
    if (!eventId) return
    setError(null)
    const meta = await ensureMapMetadata()
    const total = meta.tileManifest.totalTileCount && meta.tileManifest.totalTileCount > 0 ? meta.tileManifest.totalTileCount : estimatePackageTileCount(meta)
    const completed = meta.tileManifest.completedTileCount ?? 0
    setDownloading({ completed, total })

    await downloadOfflineMapPackage({
      pkg: meta,
      onProgress: (p) => setDownloading({ completed: p.completed, total: p.total }),
    })

    setDownloading(null)
    await refreshOfflinePkg(eventId)

    const updated = await getOfflineEventPackage(eventId)
    if (updated?.downloadStatus === 'damaged') {
      const tiles = await listOfflineTileMetadata(eventId)
      const relevant = tiles.filter((t) => t.packageVersion === updated.packageVersion)
      const done = relevant.filter((t) => t.status === 'done').length
      const errors = relevant.filter((t) => t.status === 'error').length
      const lastError = relevant.find((t) => t.status === 'error' && t.lastError)?.lastError
      setError(
        tr({
          en: `Map download incomplete. Tiles ok: ${done}. Failed: ${errors}. ${lastError ? `Last error: ${lastError}` : ''}`,
          pt: `Download do mapa incompleto. Tiles ok: ${done}. Falhas: ${errors}. ${lastError ? `Último erro: ${lastError}` : ''}`,
        }),
      )
    }
  }

  async function deleteMap() {
    if (!eventId) return
    setError(null)
    const current = await getOfflineEventPackage(eventId)
    if (current) {
      try {
        await deleteOfflineTilesForPackage({ eventId, packageVersion: current.packageVersion })
      } finally {
        await deleteOfflineEventPackage(eventId)
      }
    }
    await refreshOfflinePkg(eventId)
  }

  async function createTestAreaFromLocation() {
    if (!eventId) return
    setError(null)

    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation not supported'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 })
    })

    const center = { lat: pos.coords.latitude, lon: pos.coords.longitude }
    const bbox = {
      west: center.lon - 0.02,
      south: center.lat - 0.02,
      east: center.lon + 0.02,
      north: center.lat + 0.02,
    }

    const minZoom = 13
    const maxZoom = 15
    const now = Date.now()
    const version = `test-${now}`

    const route = {
      eventId,
      routeGeoJson: {
        type: 'Feature' as const,
        properties: { eventId, kind: 'test' },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [center.lon - 0.01, center.lat - 0.005],
            [center.lon, center.lat],
            [center.lon + 0.01, center.lat + 0.005],
          ],
        },
      },
      updatedAt: now,
    }

    const nextPkg: OfflineEventMapPackage = {
      eventId,
      eventName: pkg?.eventTitle ?? 'Test map area',
      venueName: 'Current location',
      packageVersion: version,
      boundingBox: bbox,
      center,
      minZoom,
      maxZoom,
      checkpoints: [],
      route,
      tileManifest: {
        eventId,
        packageVersion: version,
        tileTemplateUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
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

    nextPkg.tileManifest.approxBytes = await estimatePackageBytes(nextPkg)

    // Persist overlays + package.
    await putOfflineCheckpoints(eventId, [])
    await putOfflineRoute(route)
    await upsertOfflineEventPackage(nextPkg)
    await refreshOfflinePkg(eventId)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] md:max-w-3xl lg:max-w-5xl">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold"
            onClick={() => nav(-1)}
            aria-label={tr({ en: 'Back', pt: 'Voltar' })}
          >
            <span aria-hidden>←</span>
            {tr({ en: 'Back', pt: 'Voltar' })}
          </button>

          <div className="text-sm font-bold tracking-wide">{tr({ en: 'MAP', pt: 'MAPA' })}</div>
          <div className="w-[88px]" />
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-white/60">{tr({ en: 'Offline map', pt: 'Mapa offline' })}</div>
              <div className="text-sm font-semibold">
                {downloading
                  ? tr({ en: 'Downloading…', pt: 'Baixando…' })
                  : offlinePkg?.readyOffline
                    ? tr({ en: 'Ready', pt: 'Pronto' })
                    : tr({ en: 'Not downloaded', pt: 'Não baixado' })}
                {downloading ? (
                  <span className="ml-2 text-xs font-bold text-white/70">
                    {downloading.completed}/{downloading.total}
                  </span>
                ) : null}
              </div>
              {offlinePkg?.tileManifest?.approxBytes ? (
                <div className="mt-1 text-xs text-white/50">
                  ≈{Math.round(offlinePkg.tileManifest.approxBytes / (1024 * 1024))}MB
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="md"
                disabled={!eventId || !!downloading}
                onClick={() =>
                  void (async () => {
                    try {
                      await downloadMap()
                    } catch (e) {
                      setDownloading(null)
                      setError(e instanceof Error ? e.message : tr({ en: 'Map download error', pt: 'Erro ao baixar mapa' }))
                    }
                  })()
                }
              >
                {offlinePkg?.downloadStatus === 'damaged'
                  ? tr({ en: 'Resume', pt: 'Retomar' })
                  : offlinePkg?.readyOffline
                    ? tr({ en: 'Re-download', pt: 'Baixar novamente' })
                    : tr({ en: 'Download', pt: 'Baixar' })}
              </Button>

              <Button
                size="md"
                variant="secondary"
                disabled={!offlinePkg || !!downloading}
                onClick={() => void deleteMap()}
              >
                {tr({ en: 'Delete', pt: 'Excluir' })}
              </Button>

              <Button
                size="md"
                variant="secondary"
                disabled={!eventId || !!downloading}
                onClick={() =>
                  void (async () => {
                    try {
                      await createTestAreaFromLocation()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : tr({ en: 'Unable to get location', pt: 'Não foi possível obter localização' }))
                    }
                  })()
                }
              >
                {tr({ en: 'Use my location (test)', pt: 'Usar minha localização (teste)' })}
              </Button>
            </div>
          </div>

          {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
        </div>

        <div className="mt-4 flex-1 min-h-0">
          {eventId ? (
            <OfflineRaceMap eventId={eventId} heightClass="h-full" />
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm text-white/80">
              {tr({
                en: 'No active race package found. Load your Bib first.',
                pt: 'Nenhum pacote de prova ativo. Carregue seu Bib primeiro.',
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
