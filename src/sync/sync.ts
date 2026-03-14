import { supabase } from '../lib/supabase'
import { getDb } from '../offline/db'
import {
  deleteSyncQueueItem,
  getLocalSession,
  listScanEventsForSession,
  markScanSynced,
  peekSyncQueue,
} from '../offline/raceRepo'

type SyncOutcome = { ok: true } | { ok: false; error: string }

async function syncScanEvent(localScanId: string): Promise<SyncOutcome> {
  const db = await getDb()
  const scan = await db.get('scan_events', localScanId)
  if (!scan) return { ok: true }
  if (scan.synced) return { ok: true }

  const session = await db.get('race_sessions', scan.localSessionId)
  if (!session) return { ok: false, error: 'Missing local race session for scan' }

  const { error } = await supabase.functions.invoke('ingest-scan', {
    body: {
      localScanId: scan.localScanId,
      localSessionId: scan.localSessionId,
      eventId: scan.eventId,
      checkpointId: scan.checkpointId,
      checkpointCode: scan.checkpointCode,
      scannedAtDevice: scan.scannedAtDevice,
      qrRaw: scan.qrRaw,
      qrType: scan.qrType,
      isValid: scan.isValid,
      validationReason: scan.validationReason,
      expectedNextCheckpointId: scan.expectedNextCheckpointId,
      stageNo: scan.stageNo,
      createdAt: scan.createdAt,
      deviceId: session.deviceId,
    },
  })

  if (error) return { ok: false, error: error.message }
  await markScanSynced(localScanId)
  return { ok: true }
}

async function syncFinishValidation(localSessionId: string): Promise<SyncOutcome> {
  const session = await getLocalSession(localSessionId)
  if (!session) return { ok: true }

  // Best-effort: push any remaining scan events first.
  const scans = await listScanEventsForSession(localSessionId)
  for (const scan of scans) {
    if (!scan.synced) {
      const r = await syncScanEvent(scan.localScanId)
      if (!r.ok) return r
    }
  }

  const { error } = await supabase.functions.invoke('validate-finish', {
    body: { localSessionId },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function syncNow(params?: { maxItems?: number }): Promise<void> {
  if (!navigator.onLine) return
  const maxItems = params?.maxItems ?? 25
  const items = await peekSyncQueue(maxItems)

  for (const item of items) {
    if (typeof item.id !== 'number') continue

    let result: SyncOutcome = { ok: true }
    if (item.type === 'scan_event') {
      result = await syncScanEvent(item.localScanId)
    } else if (item.type === 'finish_validate') {
      result = await syncFinishValidation(item.localSessionId)
    }

    if (!result.ok) {
      // Stop on first failure to avoid hammering the backend.
      return
    }

    await deleteSyncQueueItem(item.id)
  }
}
