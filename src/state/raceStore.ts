import { create } from 'zustand'
import type { RacePackage, RaceSessionLocal, ScanEventLocal } from '../race/models'
import { getDeviceId } from '../lib/device'
import { decodeAndVerifySignedQr } from '../lib/qr'
import { applyCheckpointScan, findCheckpoint } from '../race/routeEngine'
import { isTrialModeEnabled } from '../lib/demoMode'
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
      if (isTrialModeEnabled()) {
        const now = Date.now()
        const eventId = 'demo-bra-serra-trail-21k'
        const localSessionId = 'trial_ls_1'

        const pkg: RacePackage = {
          eventId,
          eventTitle: 'Serra do Mar Trail 21K (Demo)',
          stageType: 'qualifier',
          athlete: { athleteId: 'trial_athlete_1', fullName: 'Demo Athlete', email: 'admin@admin.com' },
          bib: { bibId: 'trial_bib_101', bibNumber: '101' },
          route: {
            eventId,
            routeId: 'trial_route_1',
            routeCode: 'BRA-21K-A',
            strictOrder: true,
            stages: [
              {
                stageNo: 1,
                stageType: 'anchor',
                stageCode: '1',
                checkpoints: [
                  { checkpointId: 'cp_start', code: 'START', name: 'Start', kind: 'start' },
                  { checkpointId: 'cp1', code: 'CP1', name: 'Checkpoint 1', kind: 'checkpoint' },
                  { checkpointId: 'cp2', code: 'CP2', name: 'Checkpoint 2', kind: 'checkpoint' },
                  { checkpointId: 'cp3', code: 'CP3', name: 'Checkpoint 3', kind: 'checkpoint' },
                  { checkpointId: 'cp4', code: 'CP4', name: 'Checkpoint 4', kind: 'checkpoint' },
                  { checkpointId: 'cp_fin', code: 'FIN', name: 'Finish', kind: 'finish' },
                ],
              },
            ],
          },
          downloadedAt: now,
        }

        const startedAt = now - (1 * 3600_000 + 37 * 60_000 + 44_000)
        const finishedAt = now - 12_000
        const session: RaceSessionLocal = {
          localSessionId,
          eventId,
          athleteId: pkg.athlete.athleteId,
          bibId: pkg.bib.bibId,
          routeId: pkg.route.routeId,
          deviceId: getDeviceId(),
          status: 'official',
          startedAtDevice: startedAt,
          finishedAtDevice: finishedAt,
          progress: {
            stageIndex: 1,
            checkpointIndex: 6,
            completedCheckpointIds: ['cp_start', 'cp1', 'cp2', 'cp3', 'cp4', 'cp_fin'],
          },
          active: false,
          createdAt: startedAt,
          updatedAt: finishedAt,
        }

        const scans: ScanEventLocal[] = [
          {
            localScanId: 'trial_scan_start',
            localSessionId,
            eventId,
            checkpointId: 'cp_start',
            checkpointCode: 'START',
            scannedAtDevice: startedAt,
            qrRaw: 'DEMO',
            qrType: 'start',
            isValid: true,
            validationReason: null,
            expectedNextCheckpointId: 'cp1',
            stageNo: 1,
            synced: true,
            createdAt: startedAt,
          },
          {
            localScanId: 'trial_scan_cp1',
            localSessionId,
            eventId,
            checkpointId: 'cp1',
            checkpointCode: 'CP1',
            scannedAtDevice: startedAt + 12 * 60_000,
            qrRaw: 'DEMO',
            qrType: 'checkpoint',
            isValid: true,
            validationReason: null,
            expectedNextCheckpointId: 'cp2',
            stageNo: 1,
            synced: true,
            createdAt: startedAt + 12 * 60_000,
          },
          {
            localScanId: 'trial_scan_cp2',
            localSessionId,
            eventId,
            checkpointId: 'cp2',
            checkpointCode: 'CP2',
            scannedAtDevice: startedAt + 25 * 60_000,
            qrRaw: 'DEMO',
            qrType: 'checkpoint',
            isValid: true,
            validationReason: null,
            expectedNextCheckpointId: 'cp3',
            stageNo: 1,
            synced: true,
            createdAt: startedAt + 25 * 60_000,
          },
          {
            localScanId: 'trial_scan_cp3',
            localSessionId,
            eventId,
            checkpointId: 'cp3',
            checkpointCode: 'CP3',
            scannedAtDevice: startedAt + 38 * 60_000,
            qrRaw: 'DEMO',
            qrType: 'checkpoint',
            isValid: true,
            validationReason: null,
            expectedNextCheckpointId: 'cp4',
            stageNo: 1,
            synced: true,
            createdAt: startedAt + 38 * 60_000,
          },
          {
            localScanId: 'trial_scan_cp4',
            localSessionId,
            eventId,
            checkpointId: 'cp4',
            checkpointCode: 'CP4',
            scannedAtDevice: startedAt + 54 * 60_000,
            qrRaw: 'DEMO',
            qrType: 'checkpoint',
            isValid: true,
            validationReason: null,
            expectedNextCheckpointId: 'cp_fin',
            stageNo: 1,
            synced: true,
            createdAt: startedAt + 54 * 60_000,
          },
          {
            localScanId: 'trial_scan_fin',
            localSessionId,
            eventId,
            checkpointId: 'cp_fin',
            checkpointCode: 'FIN',
            scannedAtDevice: finishedAt,
            qrRaw: 'DEMO',
            qrType: 'finish',
            isValid: true,
            validationReason: null,
            expectedNextCheckpointId: null,
            stageNo: 1,
            synced: true,
            createdAt: finishedAt,
          },
        ]

        set({ hydrated: true, activePackage: pkg, activeSession: session, scans })
        return
      }

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
      const { getSupabase } = await import('../lib/supabase')
      const supabase = getSupabase()
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
