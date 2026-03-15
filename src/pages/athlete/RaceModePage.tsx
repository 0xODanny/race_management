import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrScanner } from '../../components/QrScanner'
import { beepError, beepOk, vibrateError, vibrateOk } from '../../lib/feedback'
import { getExpectedNext } from '../../race/routeEngine'
import { useRaceStore } from '../../state/raceStore'
import { useSync } from '../../sync/SyncProvider'
import { useWakeLock } from '../../hooks/useWakeLock'
import { useBattery } from '../../hooks/useBattery'
import { Button } from '../../ui/Button'
import { setActiveSessionId, updateLocalSession } from '../../offline/raceRepo'
import { useI18n } from '../../i18n/i18n'

function formatTimer(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const tenths = Math.floor((ms % 1000) / 100)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`
    : `${m}:${String(s).padStart(2, '0')}.${tenths}`
}

function pct(level01: number | null) {
  if (level01 == null) return '—'
  return `${Math.round(level01 * 100)}%`
}

export function RaceModePage() {
  const nav = useNavigate()
  const sync = useSync()
  const battery = useBattery()
  const { tr } = useI18n()

  const pkg = useRaceStore((s) => s.activePackage)
  const session = useRaceStore((s) => s.activeSession)
  const scans = useRaceStore((s) => s.scans)
  const feedback = useRaceStore((s) => s.feedback)
  const clearFeedback = useRaceStore((s) => s.clearFeedback)
  const startOrResume = useRaceStore((s) => s.startOrResumeSession)
  const handleScan = useRaceStore((s) => s.handleRaceQrScan)

  const [scanning, setScanning] = useState(false)
  const [now, setNow] = useState(Date.now())

  const { supported: wakeSupported } = useWakeLock(!!session && (session.status === 'racing' || session.status === 'finished_validating'))

  const totalCheckpoints = useMemo(() => {
    if (!pkg) return 0
    return pkg.route.stages.reduce((sum, s) => sum + s.checkpoints.length, 0)
  }, [pkg])

  const completedCount = session?.progress.completedCheckpointIds.length ?? 0
  const progressPct = totalCheckpoints ? Math.round((completedCount / totalCheckpoints) * 100) : 0

  const expectedNext = useMemo(() => {
    if (!pkg || !session) return null
    return getExpectedNext(pkg.route, session.progress)
  }, [pkg, session])

  const lastValid = useMemo(() => {
    const v = scans.filter((s) => s.isValid)
    return v.length ? v[v.length - 1] : null
  }, [scans])

  const timerMs = useMemo(() => {
    if (!session?.startedAtDevice) return 0
    const end = session.finishedAtDevice ?? now
    return end - session.startedAtDevice
  }, [now, session?.finishedAtDevice, session?.startedAtDevice])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(t)
  }, [])

  // Accidental-exit protection: block browser tab close + back.
  useEffect(() => {
    if (!session) return
    const protect = session.status === 'racing' || session.status === 'finished_validating'
    if (!protect) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const onPopState = () => {
      // Force the user to use the deliberate exit.
      window.history.pushState(null, '', window.location.href)
    }

    window.history.pushState(null, '', window.location.href)
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
    }
  }, [session?.status])

  // Feedback haptics / sound.
  const lastFeedbackRef = useRef<string>('')
  useEffect(() => {
    if (!feedback) return
    const key = `${feedback.kind}:${feedback.message}:${feedback.nextHint ?? ''}`
    if (key === lastFeedbackRef.current) return
    lastFeedbackRef.current = key

    if (feedback.kind === 'ok') {
      vibrateOk()
      void beepOk()
      window.setTimeout(() => clearFeedback(), 2500)
    } else {
      vibrateError()
      void beepError()
      window.setTimeout(() => clearFeedback(), 3500)
    }
  }, [feedback, clearFeedback])

  useEffect(() => {
    // Ensure session exists when opening race mode.
    if (!pkg) return
    if (session) return
    void startOrResume()
  }, [pkg, session, startOrResume])

  async function onDecoded(raw: string) {
    setScanning(false)
    await handleScan(raw)
    void sync.triggerSync()
  }

  async function exitRaceMode() {
    if (!session) {
      nav('/athlete')
      return
    }

    const ok = window.confirm(tr({ en: 'Exit Race Mode?', pt: 'Sair do Race Mode?' }))
    if (!ok) return

    const next = { ...session, active: false }
    await updateLocalSession(next)
    await setActiveSessionId(null)
    nav('/athlete', { replace: true })
  }

  // Long-press on tiny exit.
  const exitTimerRef = useRef<number | null>(null)
  function onExitDown() {
    if (exitTimerRef.current != null) return
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null
      void exitRaceMode()
    }, 1200)
  }
  function onExitUp() {
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }

  const syncStatus = !navigator.onLine
    ? 'OFFLINE'
    : sync.syncing
      ? 'SYNCING'
      : sync.lastError
        ? 'SYNC ERR'
        : 'OK'

  if (!pkg || !session) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="text-lg font-bold">{tr({ en: 'Race mode', pt: 'Race Mode' })}</div>
        <div className="mt-2 text-sm text-zinc-700">
          {tr({
            en: 'Load your Bib QR first from the dashboard.',
            pt: 'Carregue primeiro seu Bib QR no painel.',
          })}
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => nav('/athlete')}>
            {tr({ en: 'Back', pt: 'Voltar' })}
          </Button>
        </div>
      </div>
    )
  }

  const showScanner = scanning

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      {/* Tiny hard-to-hit exit */}
      <button
        onPointerDown={onExitDown}
        onPointerUp={onExitUp}
        onPointerCancel={onExitUp}
        className="absolute left-1 top-1 h-7 w-7 rounded-full border border-white/20 bg-white/5 text-[10px] opacity-50"
        aria-label="Exit race mode"
        title="Long-press to exit"
      >
        X
      </button>

      <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-white/70">ATHLETE</div>
            <div className="text-xl font-extrabold leading-tight">{pkg.athlete.fullName}</div>
            <div className="mt-1 text-sm text-white/80">
              Bib <span className="font-bold">{pkg.bib.bibNumber}</span> • Route{' '}
              <span className="font-bold">{pkg.route.routeCode}</span>
            </div>
          </div>
          <div className="text-right text-xs text-white/70">
            <div>
              Battery: <span className="font-semibold text-white">{pct(battery.level)}</span>
              {battery.charging ? <span className="ml-1">(charging)</span> : null}
            </div>
            <div>
              Sync: <span className="font-semibold text-white">{syncStatus}</span>
            </div>
            <div>
              Wake lock: <span className="font-semibold text-white">{wakeSupported ? 'ON*' : 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/70">RACE STATUS</div>
            <div className="text-xs font-bold tracking-wide">{session.status.toUpperCase()}</div>
          </div>
          <div className="mt-2 text-5xl font-extrabold tabular-nums">{formatTimer(timerMs)}</div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="text-white/80">
              {tr({ en: 'Last valid:', pt: 'Último válido:' })}{' '}
              <span className="font-bold text-white">{lastValid?.checkpointCode ?? '—'}</span>
            </div>
            <div className="text-white/80">
              {tr({ en: 'Next:', pt: 'Próximo:' })}{' '}
              <span className="font-bold text-white">{expectedNext?.code ?? '—'}</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-lime-400" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-1 text-xs text-white/60">
              {tr({ en: 'Progress:', pt: 'Progresso:' })} {completedCount}/{totalCheckpoints} ({progressPct}%)
            </div>
          </div>
        </div>

        {feedback ? (
          <div
            className={
              'mt-4 rounded-lg p-4 text-center text-lg font-extrabold ' +
              (feedback.kind === 'ok' ? 'bg-lime-400/20 text-lime-100' : 'bg-red-500/20 text-red-100')
            }
          >
            <div className="text-2xl">{feedback.kind === 'ok' ? 'CONFIRMED' : 'ERROR'}</div>
            <div className="mt-1">{feedback.message}</div>
            {feedback.kind === 'ok' && feedback.nextHint ? (
              <div className="mt-2 text-base text-white/90">{feedback.nextHint}</div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto grid gap-3 pb-4">
          <Button
            size="lg"
            className="w-full bg-white text-black hover:bg-zinc-200"
            onClick={() => setScanning(true)}
          >
            SCAN QR
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="w-full bg-white/10 text-white hover:bg-white/15"
              onClick={() => void sync.triggerSync()}
            >
              Sync
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full bg-white/10 text-white hover:bg-white/15"
              onClick={() =>
                window.alert(
                  tr({
                    en: `Scan order is enforced.\n\nNext required Checkpoint: ${expectedNext?.code ?? '—'}\n\nIf you scan a wrong or early Checkpoint, it will be rejected and logged.`,
                    pt: `A ordem de scans é aplicada.\n\nPróximo Checkpoint obrigatório: ${expectedNext?.code ?? '—'}\n\nSe você escanear um Checkpoint errado ou adiantado, ele será rejeitado e registrado.`,
                  }),
                )
              }
            >
              {tr({ en: 'Help', pt: 'Ajuda' })}
            </Button>
          </div>
          <div className="text-center text-xs text-white/50">
            {tr({
              en: 'Offline-first: scans are saved immediately and synced later.',
              pt: 'Offline-first: os scans são salvos na hora e sincronizados depois.',
            })}
          </div>
        </div>
      </div>

      {showScanner ? (
        <div className="absolute inset-0 bg-black/95 p-4">
          <div className="mx-auto flex h-full max-w-xl flex-col">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">{tr({ en: 'Scan QR', pt: 'Escanear QR' })}</div>
              <button
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-sm"
                onClick={() => setScanning(false)}
              >
                {tr({ en: 'Close', pt: 'Fechar' })}
              </button>
            </div>
            <div className="mt-4">
              <QrScanner active={scanning} onScan={onDecoded} onError={() => {}} />
            </div>
            <div className="mt-4 text-xs text-white/60">
              {tr({
                en: 'Tip: keep the QR centered and steady. The camera may take a moment in bright sunlight.',
                pt: 'Dica: mantenha o QR centralizado e firme. A câmera pode demorar um pouco sob sol forte.',
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
