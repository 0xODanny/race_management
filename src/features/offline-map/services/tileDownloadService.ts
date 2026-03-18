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
const OSM_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function isTilesProxyUrl(templateUrl: string): boolean {
  try {
    const u = new URL(templateUrl, window.location.href)
    return u.origin === window.location.origin && u.pathname.startsWith('/tiles/')
  } catch {
    return templateUrl.startsWith('/tiles/')
  }
}

async function resolveTileTemplateUrlForDownload(pkg: OfflineEventMapPackage): Promise<string> {
  const normalized = normalizeTileTemplateUrl(pkg.tileManifest.tileTemplateUrl)
  if (!isTilesProxyUrl(normalized)) return normalized

  // Probe a single tile. If Vercel blocks the proxy, use direct OSM (CORS enabled).
  try {
    const z = Math.min(Math.max(pkg.minZoom, 15), pkg.maxZoom)
    // A rough tile coordinate from package center.
    const x = Math.floor(((pkg.center.lon + 180) / 360) * 2 ** z)
    const latRad = (pkg.center.lat * Math.PI) / 180
    const n = Math.tan(Math.PI / 4 + latRad / 2)
    const y = Math.floor(((1 - Math.log(n) / Math.PI) / 2) * 2 ** z)

    const probeUrl = new URL(`/tiles/${z}/${x}/${y}.png?probe=dl&t=${Date.now()}`, window.location.href).toString()
    const res = await fetch(probeUrl, { cache: 'no-store' })
    if (res.status === 403) return OSM_TEMPLATE
  } catch {
    // If we can't probe (offline/etc), keep original.
  }

  return normalized
}

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

  const resolvedTemplate = await resolveTileTemplateUrlForDownload(pkg)

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
      const url = new URL(tileUrl(resolvedTemplate, c), window.location.href).toString()
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
        // Prefer a normal fetch (CORS) when possible so cached responses stay WebGL-usable.
        // If the host blocks CORS, fall back to `no-cors` and cache an opaque response.
        let res: Response
        try {
          res = await fetch(url)
        } catch {
          res = await fetch(url, { mode: 'no-cors' })
        }
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
