import { openDB, type DBSchema } from 'idb'
import type { RacePackage, RaceSessionLocal, ScanEventLocal } from '../race/models'
import type {
  OfflineEventMapPackage,
  OfflineGpsBreadcrumb,
  OfflineMapSyncQueueItem,
  OfflineRaceProgress,
  OfflineRouteOverlay,
  OfflineTileMetadata,
  OfflineCheckpoint,
} from '../features/offline-map/types'

export type SyncQueueItem =
  | {
      id?: number
      type: 'scan_event'
      localScanId: string
      createdAt: number
    }
  | {
      id?: number
      type: 'finish_validate'
      localSessionId: string
      createdAt: number
    }

interface RMDB extends DBSchema {
  meta: {
    key: string
    value: string
  }
  race_packages: {
    key: string // `${eventId}:${bibId}`
    value: RacePackage
  }
  race_sessions: {
    key: string // localSessionId
    value: RaceSessionLocal
    indexes: { by_active: any; by_event: string }
  }
  scan_events: {
    key: string // localScanId
    value: ScanEventLocal
    indexes: { by_session: string; by_synced: any }
  }
  sync_queue: {
    key: number
    value: SyncQueueItem
    indexes: { by_type: SyncQueueItem['type'] }
  }

  // Offline map module
  offline_event_packages: {
    key: string // eventId
    value: OfflineEventMapPackage
  }
  offline_tiles_metadata: {
    key: string // tileKey
    value: OfflineTileMetadata
    indexes: { by_event: string; by_status: OfflineTileMetadata['status'] }
  }
  offline_checkpoints: {
    key: string // `${eventId}:${checkpointId}`
    value: OfflineCheckpoint
    indexes: { by_event: string }
  }
  offline_routes: {
    key: string // eventId
    value: OfflineRouteOverlay
  }
  offline_race_progress: {
    key: string // progress.key
    value: OfflineRaceProgress
    indexes: { by_event: string }
  }
  offline_gps_breadcrumbs: {
    key: number
    value: OfflineGpsBreadcrumb
    indexes: { by_event: string; by_synced: any }
  }
  offline_sync_queue: {
    key: number
    value: OfflineMapSyncQueueItem
    indexes: { by_type: OfflineMapSyncQueueItem['type']; by_event: string }
  }
}

const DB_NAME = 'rm_pwa_v1'
const DB_VERSION = 2

export async function getDb() {
  return openDB<RMDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
      if (!db.objectStoreNames.contains('race_packages')) {
        db.createObjectStore('race_packages')
      }
      if (!db.objectStoreNames.contains('race_sessions')) {
        const store = db.createObjectStore('race_sessions', { keyPath: 'localSessionId' })
        store.createIndex('by_active', 'active')
        store.createIndex('by_event', 'eventId')
      }
      if (!db.objectStoreNames.contains('scan_events')) {
        const store = db.createObjectStore('scan_events', { keyPath: 'localScanId' })
        store.createIndex('by_session', 'localSessionId')
        store.createIndex('by_synced', 'synced')
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
        store.createIndex('by_type', 'type')
      }

      if (!db.objectStoreNames.contains('offline_event_packages')) {
        db.createObjectStore('offline_event_packages')
      }
      if (!db.objectStoreNames.contains('offline_tiles_metadata')) {
        const store = db.createObjectStore('offline_tiles_metadata', { keyPath: 'tileKey' })
        store.createIndex('by_event', 'eventId')
        store.createIndex('by_status', 'status')
      }
      if (!db.objectStoreNames.contains('offline_checkpoints')) {
        const store = db.createObjectStore('offline_checkpoints')
        store.createIndex('by_event', 'eventId')
      }
      if (!db.objectStoreNames.contains('offline_routes')) {
        db.createObjectStore('offline_routes')
      }
      if (!db.objectStoreNames.contains('offline_race_progress')) {
        const store = db.createObjectStore('offline_race_progress', { keyPath: 'key' })
        store.createIndex('by_event', 'eventId')
      }
      if (!db.objectStoreNames.contains('offline_gps_breadcrumbs')) {
        const store = db.createObjectStore('offline_gps_breadcrumbs', { keyPath: 'id', autoIncrement: true })
        store.createIndex('by_event', 'eventId')
        store.createIndex('by_synced', 'synced')
      }
      if (!db.objectStoreNames.contains('offline_sync_queue')) {
        const store = db.createObjectStore('offline_sync_queue', { keyPath: 'id', autoIncrement: true })
        store.createIndex('by_type', 'type')
        store.createIndex('by_event', 'eventId')
      }
    },
  })
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb()
  return (await db.get('meta', key)) ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb()
  await db.put('meta', value, key)
}
