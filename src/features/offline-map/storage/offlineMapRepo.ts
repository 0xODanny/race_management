import { getDb } from '../../../offline/db'
import type {
  OfflineCheckpoint,
  OfflineEventMapPackage,
  OfflineRaceProgress,
  OfflineRouteOverlay,
  OfflineTileMetadata,
} from '../types'

function cpKey(eventId: string, checkpointId: string) {
  return `${eventId}:${checkpointId}`
}

export async function getOfflineEventPackage(eventId: string): Promise<OfflineEventMapPackage | null> {
  const db = await getDb()
  return (await db.get('offline_event_packages', eventId)) ?? null
}

export async function upsertOfflineEventPackage(pkg: OfflineEventMapPackage): Promise<void> {
  const db = await getDb()
  await db.put('offline_event_packages', pkg, pkg.eventId)
}

export async function deleteOfflineEventPackage(eventId: string): Promise<void> {
  const db = await getDb()
  await db.delete('offline_event_packages', eventId)

  // Delete checkpoints
  const cps = await db.getAllFromIndex('offline_checkpoints', 'by_event', eventId)
  for (const cp of cps) {
    await db.delete('offline_checkpoints', cpKey(eventId, cp.checkpointId))
  }

  // Delete route
  await db.delete('offline_routes', eventId)

  // Delete tile metadata
  const tiles = await db.getAllFromIndex('offline_tiles_metadata', 'by_event', eventId)
  for (const t of tiles) {
    await db.delete('offline_tiles_metadata', t.tileKey)
  }

  // Delete event-scoped progress
  await db.delete('offline_race_progress', `event:${eventId}`)
}

export async function putOfflineCheckpoints(eventId: string, checkpoints: OfflineCheckpoint[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('offline_checkpoints', 'readwrite')
  for (const cp of checkpoints) {
    await tx.store.put({ ...cp, eventId }, cpKey(eventId, cp.checkpointId))
  }
  await tx.done
}

export async function listOfflineCheckpoints(eventId: string): Promise<OfflineCheckpoint[]> {
  const db = await getDb()
  return await db.getAllFromIndex('offline_checkpoints', 'by_event', eventId)
}

export async function putOfflineRoute(route: OfflineRouteOverlay): Promise<void> {
  const db = await getDb()
  await db.put('offline_routes', route, route.eventId)
}

export async function getOfflineRoute(eventId: string): Promise<OfflineRouteOverlay | null> {
  const db = await getDb()
  return (await db.get('offline_routes', eventId)) ?? null
}

export async function upsertOfflineTileMetadata(meta: OfflineTileMetadata): Promise<void> {
  const db = await getDb()
  await db.put('offline_tiles_metadata', meta)
}

export async function listOfflineTileMetadata(eventId: string): Promise<OfflineTileMetadata[]> {
  const db = await getDb()
  return await db.getAllFromIndex('offline_tiles_metadata', 'by_event', eventId)
}

export async function getOfflineRaceProgress(eventId: string): Promise<OfflineRaceProgress | null> {
  const db = await getDb()
  return (await db.get('offline_race_progress', `event:${eventId}`)) ?? null
}

export async function upsertOfflineRaceProgress(next: OfflineRaceProgress): Promise<void> {
  const db = await getDb()
  await db.put('offline_race_progress', next)
}
