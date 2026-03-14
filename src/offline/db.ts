import { openDB, type DBSchema } from 'idb'
import type { RacePackage, RaceSessionLocal, ScanEventLocal } from '../race/models'

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
}

const DB_NAME = 'rm_pwa_v1'
const DB_VERSION = 1

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
