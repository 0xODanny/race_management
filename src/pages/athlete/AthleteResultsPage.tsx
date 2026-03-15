import { useMemo } from 'react'
import { useRaceStore } from '../../state/raceStore'
import { useI18n } from '../../i18n/i18n'

function formatMs(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function AthleteResultsPage() {
  const { tr } = useI18n()
  const session = useRaceStore((s) => s.activeSession)
  const scans = useRaceStore((s) => s.scans)

  const provisional = useMemo(() => {
    if (!session?.startedAtDevice) return null
    const end = session.finishedAtDevice ?? Date.now()
    return end - session.startedAtDevice
  }, [session?.startedAtDevice, session?.finishedAtDevice])

  if (!session) {
    return <div className="text-sm text-zinc-700">{tr({ en: 'No active session.', pt: 'Nenhuma sessão ativa.' })}</div>
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'My results', pt: 'Meus resultados' })}</h1>
        <div className="mt-3 grid gap-2 text-sm">
          <div>
            <span className="font-semibold">Status:</span> {session.status}
          </div>
          <div>
            <span className="font-semibold">{tr({ en: 'Provisional time:', pt: 'Tempo provisional:' })}</span> {formatMs(provisional)}
          </div>
          <div className="text-xs text-zinc-600">
            {tr({
              en: 'Official validation happens server-side after all scan events are synced.',
              pt: 'A validação official acontece no servidor depois que todos os scans forem sincronizados.',
            })}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Scan log (device)', pt: 'Log de scans (dispositivo)' })}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-3 py-2">{tr({ en: 'Time', pt: 'Hora' })}</th>
                <th className="px-3 py-2">CP</th>
                <th className="px-3 py-2">{tr({ en: 'Valid', pt: 'Válido' })}</th>
                <th className="px-3 py-2">{tr({ en: 'Reason', pt: 'Motivo' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {scans
                .slice()
                .sort((a, b) => a.scannedAtDevice - b.scannedAtDevice)
                .map((s) => (
                  <tr key={s.localScanId}>
                    <td className="px-3 py-2">{new Date(s.scannedAtDevice).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 font-semibold">{s.checkpointCode}</td>
                    <td className="px-3 py-2">{s.isValid ? tr({ en: 'YES', pt: 'SIM' }) : tr({ en: 'NO', pt: 'NÃO' })}</td>
                    <td className="px-3 py-2">{s.validationReason ?? '—'}</td>
                  </tr>
                ))}
              {!scans.length ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-700" colSpan={4}>
                    {tr({ en: 'No scans yet.', pt: 'Nenhum scan ainda.' })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
