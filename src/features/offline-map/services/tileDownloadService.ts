import type { OfflineEventMapPackage } from '../types'
import { normalizeTileTemplateUrl, tilesForBoundingBox, tileKey, tileUrl } from '../utils/tiles'
import { tilesCacheName } from './cacheNames'
import {
  listOfflineTileMetadata,
  putOfflineCheckpoints,
  putOfflineRoute,
  upsertOfflineEventPackage,
  upsertOfflineTileMetadata,
} from '../storage/offlineMapRepo'

const AVG_TILE_BYTES = 40_000

export function estimatePackageTileCount(pkg: OfflineEventMapPackage): number {
  return tilesForBoundingBox(pkg.boundingBox, pkg.minZoom, pkg.maxZoom).length
}

export type TileDownloadProgress = {
  eventId: string
  packageVersion: string
  completed: number
  total: number
  approxBytes: number
}

export async function estimatePackageBytes(pkg: OfflineEventMapPackage): Promise<number> {
  return estimatePackageTileCount(pkg) * AVG_TILE_BYTES
}

export async function downloadOfflineMapPackage(params: {
  pkg: OfflineEventMapPackage
  onProgress?: (p: TileDownloadProgress) => void
}): Promise<void> {
  const { pkg, onProgress } = params

  // Persist overlays first so the map can at least open and show status.
  await putOfflineCheckpoints(pkg.eventId, pkg.checkpoints)
  await putOfflineRoute(pkg.route)

  const tiles = tilesForBoundingBox(pkg.boundingBox, pkg.minZoom, pkg.maxZoom)
  const total = tiles.length
  const approxBytes = total * AVG_TILE_BYTES

  const existing = await listOfflineTileMetadata(pkg.eventId)
  const existingByKey = new Map(existing.filter((t) => t.packageVersion === pkg.packageVersion).map((t) => [t.tileKey, t]))

  let completed = 0
  for (const t of existingByKey.values()) if (t.status === 'done') completed++

  const cache = await caches.open(tilesCacheName())

  // Mark package as downloading.
  const nextPkg: OfflineEventMapPackage = {
    ...pkg,
    tileManifest: {
      ...pkg.tileManifest,
      approxBytes,
      totalTileCount: total,
      completedTileCount: completed,
    },
    downloadStatus: 'downloading',
    readyOffline: false,
    updatedAt: Date.now(),
  }
  await upsertOfflineEventPackage(nextPkg)
  onProgress?.({ eventId: pkg.eventId, packageVersion: pkg.packageVersion, completed, total, approxBytes })

  const concurrency = 4
  let index = 0

  async function worker() {
    while (index < tiles.length) {
      const i = index++
      const c = tiles[i]!
      const normalizedTemplate = normalizeTileTemplateUrl(pkg.tileManifest.tileTemplateUrl)
      const url = new URL(tileUrl(normalizedTemplate, c), window.location.href).toString()
      const key = tileKey(pkg.eventId, pkg.packageVersion, c)

      const prev = existingByKey.get(key)
      if (prev?.status === 'done') continue

      const now = Date.now()
      await upsertOfflineTileMetadata({
        tileKey: key,
        eventId: pkg.eventId,
        packageVersion: pkg.packageVersion,
        z: c.z,
        x: c.x,
        y: c.y,
        url,
        status: 'pending',
        updatedAt: now,
      })

      try {
        // Some tile hosts do not send CORS headers. For offline use, we can still
        // prefetch and cache opaque responses. However, when using same-origin
        // `/tiles/...` (proxy), we must avoid `no-cors` so tiles remain WebGL-usable.
        const isSameOrigin = new URL(url).origin === window.location.origin
        const res = isSameOrigin ? await fetch(url) : await fetch(url, { mode: 'no-cors' })
        if (!(res.ok || res.type === 'opaque')) {
          throw new Error(`Tile fetch failed (${res.status})`)
        }
        await cache.put(url, res.clone())

        completed++
        await upsertOfflineTileMetadata({
          tileKey: key,
          eventId: pkg.eventId,
          packageVersion: pkg.packageVersion,
          z: c.z,
          x: c.x,
          y: c.y,
          url,
          status: 'done',
          updatedAt: Date.now(),
        })
      } catch (e) {
        await upsertOfflineTileMetadata({
          tileKey: key,
          eventId: pkg.eventId,
          packageVersion: pkg.packageVersion,
          z: c.z,
          x: c.x,
          y: c.y,
          url,
          status: 'error',
          lastError: e instanceof Error ? e.message : 'Tile download error',
          updatedAt: Date.now(),
        })
      }

      onProgress?.({ eventId: pkg.eventId, packageVersion: pkg.packageVersion, completed, total, approxBytes })
      await upsertOfflineEventPackage({
        ...nextPkg,
        tileManifest: {
          ...nextPkg.tileManifest,
          completedTileCount: completed,
          totalTileCount: total,
          approxBytes,
        },
        updatedAt: Date.now(),
      })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const finalStatus = completed >= total ? 'ready' : 'damaged'
  await upsertOfflineEventPackage({
    ...nextPkg,
    tileManifest: {
      ...nextPkg.tileManifest,
      completedTileCount: completed,
      totalTileCount: total,
      approxBytes,
    },
    downloadStatus: finalStatus,
    readyOffline: completed >= total,
    updatedAt: Date.now(),
  })
}

export async function deleteOfflineTilesForPackage(params: { eventId: string; packageVersion: string }): Promise<void> {
  const { eventId, packageVersion } = params
  const tiles = await listOfflineTileMetadata(eventId)
  const cache = await caches.open(tilesCacheName())

  for (const t of tiles) {
    if (t.packageVersion !== packageVersion) continue
    try {
      await cache.delete(t.url)
    } catch {
      // ignore
    }
  }
}
