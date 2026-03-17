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

type FlashState =
  | { kind: 'ok'; title: string; message?: string }
  | { kind: 'error'; title: string; message: string }

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
  const [flash, setFlash] = useState<FlashState | null>(null)
  const flashTimerRef = useRef<number | null>(null)

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

  const orderedCheckpoints = useMemo(() => {
    if (!pkg) return []
    return pkg.route.stages.flatMap((stage) =>
      stage.checkpoints.map((cp) => ({
        checkpointId: cp.checkpointId,
        code: cp.code,
        name: cp.name,
        kind: cp.kind,
        stageNo: stage.stageNo,
        stageCode: stage.stageCode,
      })),
    )
  }, [pkg])

  const lastValid = useMemo(() => {
    const v = scans.filter((s) => s.isValid)
    return v.length ? v[v.length - 1] : null
  }, [scans])

  const timerMs = useMemo(() => {
    if (!session?.startedAtDevice) return 0
    const end = session.finishedAtDevice ?? now
    return end - session.startedAtDevice
  }, [now, session?.finishedAtDevice, session?.startedAtDevice])

  const timeOfDay = useMemo(() => {
    try {
      return new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ''
    }
  }, [now])

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

  function localizeScanError(params: { message: string; expected?: string }) {
    const { message, expected } = params
    if (expected) {
      return tr({
        en: `Not correct checkpoint read — you need checkpoint ${expected}.`,
        pt: `Checkpoint incorreto — você precisa do checkpoint ${expected}.`,
      })
    }

    const map: Record<string, { en: string; pt: string }> = {
      'Wrong event QR': { en: 'Wrong event QR', pt: 'QR do evento errado' },
      'Bib QR is not allowed in Race Mode': {
        en: 'Bib QR is not allowed in Race Mode',
        pt: 'QR de Bib não é permitido no Race Mode',
      },
      'Checkpoint QR missing checkpointId': {
        en: 'Checkpoint QR is missing checkpointId',
        pt: 'QR do checkpoint sem checkpointId',
      },
      'Already scanned': { en: 'Already scanned', pt: 'Já escaneado' },
      'Route is already complete': { en: 'Route is already complete', pt: 'A rota já foi concluída' },
      'Invalid checkpoint': { en: 'Invalid checkpoint', pt: 'Checkpoint inválido' },
      'Unrecognized QR format': { en: 'Unrecognized QR format', pt: 'Formato de QR não reconhecido' },
      'Invalid QR signature': { en: 'Invalid QR signature', pt: 'Assinatura do QR inválida' },
      'Unsupported QR version': { en: 'Unsupported QR version', pt: 'Versão do QR não suportada' },
      'Malformed QR payload': { en: 'Malformed QR payload', pt: 'Conteúdo do QR inválido' },
    }

    const translated = map[message]
    if (translated) return tr(translated)
    return message
  }

  function triggerFlash(next: FlashState, ms: number) {
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
    setFlash(next)
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null
      setFlash(null)
    }, ms)
  }

  // Full-screen visual confirmation (green) / rejection (red).
  const lastFlashKeyRef = useRef<string>('')
  useEffect(() => {
    if (!feedback) return
    const expected = feedback.kind === 'error' ? (feedback.expected ?? '') : ''
    const nextHint = feedback.kind === 'ok' ? (feedback.nextHint ?? '') : ''
    const key = `${feedback.kind}:${feedback.message}:${expected}:${nextHint}`
    if (key === lastFlashKeyRef.current) return
    lastFlashKeyRef.current = key

    if (feedback.kind === 'ok') {
      triggerFlash(
        {
          kind: 'ok',
          title: tr({ en: 'CONFIRMED', pt: 'CONFIRMADO' }),
          message: feedback.message,
        },
        2000,
      )
    } else {
      triggerFlash(
        {
          kind: 'error',
          title: tr({ en: 'ERROR', pt: 'ERRO' }),
          message: localizeScanError({ message: feedback.message, expected: feedback.expected }),
        },
        2000,
      )
    }
  }, [feedback, tr])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current)
    }
  }, [])

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

  const lastScannerErrorAtRef = useRef<number>(0)
  function onScannerError(message: string) {
    const now = Date.now()
    if (now - lastScannerErrorAtRef.current < 1800) return
    lastScannerErrorAtRef.current = now

    // Camera / decode failures that don't produce a valid QR.
    vibrateError()
    void beepError()
    triggerFlash(
      {
        kind: 'error',
        title: tr({ en: 'ERROR', pt: 'ERRO' }),
        message:
          message && message.trim()
            ? tr({
                en: `Unable to read QR. ${message}`,
                pt: `Não foi possível ler o QR. ${message}`,
              })
            : tr({ en: 'Unable to read QR. Try again.', pt: 'Não foi possível ler o QR. Tente novamente.' }),
      },
      2000,
    )
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
    ? tr({ en: 'OFFLINE', pt: 'OFFLINE' })
    : sync.syncing
      ? tr({ en: 'SYNCING', pt: 'SINCRONIZANDO' })
      : sync.lastError
        ? tr({ en: 'SYNC ERR', pt: 'ERRO SYNC' })
        : tr({ en: 'OK', pt: 'OK' })

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

  const completed = new Set(session.progress.completedCheckpointIds)
  const nextId = expectedNext?.checkpointId ?? null

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      {flash ? (
        <div
          className={
            'absolute inset-0 z-[60] flex items-center justify-center px-6 text-center ' +
            (flash.kind === 'ok' ? 'bg-lime-400 text-black' : 'bg-red-600 text-white')
          }
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          role="status"
          aria-live="polite"
        >
          <div className="max-w-md">
            <div className="text-4xl font-extrabold tracking-tight">{flash.title}</div>
            {flash.message ? <div className="mt-3 text-lg font-semibold leading-snug">{flash.message}</div> : null}
          </div>
        </div>
      ) : null}

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
              {tr({ en: 'Battery:', pt: 'Bateria:' })}{' '}
              <span className="font-semibold text-white">{pct(battery.level)}</span>
              {battery.charging ? <span className="ml-1">({tr({ en: 'charging', pt: 'carregando' })})</span> : null}
            </div>
            <div>
              Sync: <span className="font-semibold text-white">{syncStatus}</span>
            </div>
            <div>
              {tr({ en: 'Wake lock:', pt: 'Wake lock:' })}{' '}
              <span className="font-semibold text-white">{wakeSupported ? tr({ en: 'ON*', pt: 'ON*' }) : tr({ en: 'N/A', pt: 'N/A' })}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/70">{tr({ en: 'RACE STATUS', pt: 'STATUS' })}</div>
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
          <div className="mt-2 text-xs text-white/60">
            {tr({ en: 'Time of day:', pt: 'Hora:' })} <span className="font-semibold text-white/90">{timeOfDay || '—'}</span>
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

        <div className="mt-4 flex-1 overflow-y-auto">
          {feedback ? (
            <div
              className={
                'rounded-lg p-4 text-center text-lg font-extrabold ' +
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

          <div className={(feedback ? 'mt-3 ' : '') + 'rounded-lg border border-white/10 bg-white/5 p-3'}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-bold tracking-wide text-white/70">{tr({ en: 'CHECKPOINTS', pt: 'CHECKPOINTS' })}</div>
              <div className="text-[11px] text-white/50">
                {tr({ en: 'Next:', pt: 'Próximo:' })} <span className="font-semibold text-white/70">{expectedNext?.code ?? '—'}</span>
              </div>
            </div>
            <div className="max-h-[32vh] overflow-y-auto rounded-md">
              <div className="space-y-1">
                {orderedCheckpoints.map((cp) => {
                  const isDone = completed.has(cp.checkpointId)
                  const isNext = !!nextId && cp.checkpointId === nextId
                  const rowClass = isNext
                    ? 'border border-white/20 bg-white/10'
                    : isDone
                      ? 'bg-white/0'
                      : 'bg-white/0'

                  return (
                    <div key={cp.checkpointId} className={rowClass + ' flex items-center justify-between rounded-md px-2 py-2'}>
                      <div className="min-w-0">
                        <div className={"truncate text-sm font-semibold " + (isDone ? 'text-white' : 'text-white/85')}>
                          {cp.code}
                          {cp.name ? <span className="ml-2 text-xs font-normal text-white/60">{cp.name}</span> : null}
                        </div>
                        <div className="text-[11px] text-white/45">
                          {tr({ en: 'Stage', pt: 'Etapa' })} {cp.stageCode}
                          {cp.kind === 'start'
                            ? ` • ${tr({ en: 'start', pt: 'largada' })}`
                            : cp.kind === 'finish'
                              ? ` • ${tr({ en: 'finish', pt: 'chegada' })}`
                              : ''}
                        </div>
                      </div>
                      <div className="ml-3 shrink-0 text-xs font-bold">
                        {isDone ? (
                          <span className="text-lime-300">✓</span>
                        ) : isNext ? (
                          <span className="text-white">{tr({ en: 'NEXT', pt: 'PRÓX' })}</span>
                        ) : (
                          <span className="text-white/35">•</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 pb-4">
          <Button
            size="lg"
            className="w-full bg-white text-black hover:bg-zinc-200"
            onClick={() => setScanning(true)}
          >
            {tr({ en: 'SCAN QR', pt: 'ESCANEAR QR' })}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="w-full bg-white/10 text-white hover:bg-white/15"
              onClick={() => void sync.triggerSync()}
            >
              {tr({ en: 'Sync', pt: 'Sync' })}
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
              <QrScanner active={scanning} onScan={onDecoded} onError={onScannerError} />
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
