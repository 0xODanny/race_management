import { create } from 'zustand'
import type { RacePackage, RaceSessionLocal, ScanEventLocal } from '../race/models'
import { getDeviceId } from '../lib/device'
import { decodeAndVerifySignedQr } from '../lib/qr'
import { applyCheckpointScan, findCheckpoint } from '../race/routeEngine'
import {
  addScanEvent,
  createLocalSession,
  enqueueFinishValidation,
  getActiveSessionId,
  getLocalSession,
  getRacePackage,
  listScanEventsForSession,
  saveRacePackage,
  updateLocalSession,
} from '../offline/raceRepo'

export type RaceUiFeedback =
  | { kind: 'ok'; message: string; nextHint?: string }
  | { kind: 'error'; message: string; expected?: string; nextHint?: string }

type RaceStoreState = {
  hydrated: boolean
  activePackage: RacePackage | null
  activeSession: RaceSessionLocal | null
  scans: ScanEventLocal[]
  feedback: RaceUiFeedback | null

  hydrate: () => Promise<void>
  clearFeedback: () => void

  loadPackageFromServerByBibQr: (rawQr: string) => Promise<{ ok: true } | { ok: false; error: string }>
  startOrResumeSession: () => Promise<{ ok: true } | { ok: false; error: string }>
  handleRaceQrScan: (rawQr: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

export const useRaceStore = create<RaceStoreState>((set, get) => ({
  hydrated: false,
  activePackage: null,
  activeSession: null,
  scans: [],
  feedback: null,

  hydrate: async () => {
    const activeId = await getActiveSessionId()
    if (!activeId) {
      set({ hydrated: true })
      return
    }

    const session = await getLocalSession(activeId)
    if (!session) {
      set({ hydrated: true, activeSession: null, activePackage: null, scans: [] })
      return
    }

    const pkg = await getRacePackage(session.eventId, session.bibId)
    const scans = await listScanEventsForSession(session.localSessionId)

    set({ hydrated: true, activeSession: session, activePackage: pkg, scans })
  },

  clearFeedback: () => set({ feedback: null }),

  loadPackageFromServerByBibQr: async (rawQr) => {
    const decoded = decodeAndVerifySignedQr(rawQr)
    if (!decoded.ok) return { ok: false, error: decoded.error }
    if (decoded.payload.t !== 'bib') return { ok: false, error: 'This is not a Bib QR' }
    if (!decoded.payload.bibId) return { ok: false, error: 'Bib QR missing bibId' }

    // For MVP: use Supabase Edge Function `race-package`.
    // It returns the full route definition and athlete/bib binding.
    try {
      const { supabase } = await import('../lib/supabase')
      const { data, error } = await supabase.functions.invoke('race-package', {
        body: {
          eventId: decoded.payload.eventId,
          bibId: decoded.payload.bibId,
          bibQrRaw: rawQr,
        },
      })
      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, error: 'No race package returned' }

      const pkg = data as RacePackage
      await saveRacePackage(pkg)
      set({ activePackage: pkg })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Race package load failed' }
    }
  },

  startOrResumeSession: async () => {
    const { activePackage, activeSession } = get()
    if (!activePackage) return { ok: false, error: 'No race package loaded yet' }

    if (activeSession && activeSession.active) return { ok: true }

    const session = await createLocalSession({
      eventId: activePackage.eventId,
      athleteId: activePackage.athlete.athleteId,
      bibId: activePackage.bib.bibId,
      routeId: activePackage.route.routeId,
      deviceId: getDeviceId(),
    })
    set({ activeSession: session, scans: [] })
    return { ok: true }
  },

  handleRaceQrScan: async (rawQr) => {
    const { activePackage, activeSession } = get()
    if (!activePackage || !activeSession) return { ok: false, error: 'Race not initialized' }

    const decoded = decodeAndVerifySignedQr(rawQr)
    if (!decoded.ok) {
      set({ feedback: { kind: 'error', message: decoded.error } })
      return { ok: false, error: decoded.error }
    }

    const p = decoded.payload
    if (p.eventId !== activePackage.eventId) {
      set({ feedback: { kind: 'error', message: 'Wrong event QR' } })
      return { ok: false, error: 'Wrong event QR' }
    }

    if (p.t === 'bib') {
      set({ feedback: { kind: 'error', message: 'Bib QR is not allowed in Race Mode' } })
      return { ok: false, error: 'Bib QR is not allowed in Race Mode' }
    }

    if (!p.checkpointId) {
      set({ feedback: { kind: 'error', message: 'Checkpoint QR missing checkpointId' } })
      return { ok: false, error: 'Checkpoint QR missing checkpointId' }
    }

    const applied = applyCheckpointScan({
      route: activePackage.route,
      progress: activeSession.progress,
      scannedCheckpointId: p.checkpointId,
      scannedKind: p.t,
    })

    const scannedDef = findCheckpoint(activePackage.route, p.checkpointId)
    const checkpointCode = scannedDef?.code ?? 'UNKNOWN'

    const now = Date.now()
    const scan = await addScanEvent({
      localSessionId: activeSession.localSessionId,
      eventId: activeSession.eventId,
      checkpointId: p.checkpointId,
      checkpointCode,
      scannedAtDevice: now,
      qrRaw: rawQr,
      qrType: p.t,
      isValid: applied.isValid,
      validationReason: applied.reason,
      expectedNextCheckpointId: applied.expectedNextCheckpointId,
      stageNo: applied.stageNo,
    })

    let nextStatus = activeSession.status
    let startedAtDevice = activeSession.startedAtDevice
    let finishedAtDevice = activeSession.finishedAtDevice

    if (applied.isValid && p.t === 'start' && !startedAtDevice) {
      startedAtDevice = now
      nextStatus = 'racing'
    }

    if (applied.isValid && p.t === 'finish') {
      finishedAtDevice = now
      nextStatus = 'finished_validating'
      await enqueueFinishValidation(activeSession.localSessionId)
    }

    const nextSession: RaceSessionLocal = {
      ...activeSession,
      status: nextStatus,
      startedAtDevice,
      finishedAtDevice,
      progress: applied.progress,
      updatedAt: now,
    }
    await updateLocalSession(nextSession)

    const scans = [...get().scans, scan]

    if (applied.isValid) {
      const nextHint = applied.expectedNextCheckpointCode ? `Next: ${applied.expectedNextCheckpointCode}` : undefined
      set({
        activeSession: nextSession,
        scans,
        feedback: { kind: 'ok', message: `${checkpointCode} confirmed`, nextHint },
      })
    } else {
      set({
        activeSession: nextSession,
        scans,
        feedback: {
          kind: 'error',
          message: applied.reason ?? 'Invalid scan',
          expected: applied.expectedNextCheckpointCode ?? undefined,
        },
      })
    }

    return { ok: true }
  },
}))
