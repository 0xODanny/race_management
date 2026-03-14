import { nanoid } from 'nanoid'
import type { RacePackage, RaceSessionLocal, ScanEventLocal } from '../race/models'
import { getDb, getMeta, setMeta, type SyncQueueItem } from './db'

const ACTIVE_SESSION_KEY = 'active_session_id'

export async function saveRacePackage(pkg: RacePackage): Promise<void> {
  const db = await getDb()
  const key = `${pkg.eventId}:${pkg.bib.bibId}`
  await db.put('race_packages', pkg, key)
}

export async function getRacePackage(eventId: string, bibId: string): Promise<RacePackage | null> {
  const db = await getDb()
  const key = `${eventId}:${bibId}`
  return (await db.get('race_packages', key)) ?? null
}

export async function createLocalSession(params: {
  eventId: string
  athleteId: string
  bibId: string
  routeId: string
  deviceId: string
}): Promise<RaceSessionLocal> {
  const now = Date.now()
  const session: RaceSessionLocal = {
    localSessionId: `ls_${nanoid(16)}`,
    eventId: params.eventId,
    athleteId: params.athleteId,
    bibId: params.bibId,
    routeId: params.routeId,
    deviceId: params.deviceId,
    status: 'not_started',
    progress: { stageIndex: 0, checkpointIndex: 0, completedCheckpointIds: [] },
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  const db = await getDb()
  await db.put('race_sessions', session)
  await setActiveSessionId(session.localSessionId)
  return session
}

export async function updateLocalSession(session: RaceSessionLocal): Promise<void> {
  const db = await getDb()
  await db.put('race_sessions', { ...session, updatedAt: Date.now() })
  if (session.active) {
    await setActiveSessionId(session.localSessionId)
  }
}

export async function getLocalSession(localSessionId: string): Promise<RaceSessionLocal | null> {
  const db = await getDb()
  return (await db.get('race_sessions', localSessionId)) ?? null
}

export async function setActiveSessionId(localSessionId: string | null): Promise<void> {
  if (!localSessionId) {
    await setMeta(ACTIVE_SESSION_KEY, '')
  } else {
    await setMeta(ACTIVE_SESSION_KEY, localSessionId)
  }
}

export async function getActiveSessionId(): Promise<string | null> {
  const value = await getMeta(ACTIVE_SESSION_KEY)
  if (!value) return null
  return value
}

export async function addScanEvent(event: Omit<ScanEventLocal, 'localScanId' | 'createdAt' | 'synced'>): Promise<ScanEventLocal> {
  const now = Date.now()
  const scan: ScanEventLocal = {
    ...event,
    localScanId: `le_${nanoid(18)}`,
    createdAt: now,
    synced: false,
  }
  const db = await getDb()
  await db.put('scan_events', scan)
  await enqueueSync({ type: 'scan_event', localScanId: scan.localScanId, createdAt: now })
  return scan
}

export async function listScanEventsForSession(localSessionId: string): Promise<ScanEventLocal[]> {
  const db = await getDb()
  return await db.getAllFromIndex('scan_events', 'by_session', localSessionId)
}

export async function markScanSynced(localScanId: string): Promise<void> {
  const db = await getDb()
  const scan = await db.get('scan_events', localScanId)
  if (!scan) return
  await db.put('scan_events', { ...scan, synced: true })
}

export async function enqueueFinishValidation(localSessionId: string): Promise<void> {
  await enqueueSync({ type: 'finish_validate', localSessionId, createdAt: Date.now() })
}

export async function enqueueSync(item: SyncQueueItem): Promise<number> {
  const db = await getDb()
  return await db.add('sync_queue', item)
}

export async function peekSyncQueue(limit: number): Promise<SyncQueueItem[]> {
  const db = await getDb()
  const tx = db.transaction('sync_queue', 'readonly')
  const items: SyncQueueItem[] = []
  let cursor = await tx.store.openCursor()
  while (cursor && items.length < limit) {
    items.push(cursor.value)
    cursor = await cursor.continue()
  }
  await tx.done
  return items
}

export async function deleteSyncQueueItem(id: number): Promise<void> {
  const db = await getDb()
  await db.delete('sync_queue', id)
}
