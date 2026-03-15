import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrScanner } from '../../components/QrScanner'
import { useRaceStore } from '../../state/raceStore'
import { Button } from '../../ui/Button'
import { useI18n } from '../../i18n/i18n'

export function AthleteDashboardPage() {
  const nav = useNavigate()
  const { tr } = useI18n()
  const pkg = useRaceStore((s) => s.activePackage)
  const session = useRaceStore((s) => s.activeSession)
  const loadByBib = useRaceStore((s) => s.loadPackageFromServerByBibQr)
  const startOrResume = useRaceStore((s) => s.startOrResumeSession)

  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onBibScan(raw: string) {
    setScanning(false)
    setError(null)
    const r = await loadByBib(raw)
    if (!r.ok) setError(r.error)
  }

  async function enterRace() {
    setError(null)
    const r = await startOrResume()
    if (!r.ok) {
      setError(r.error)
      return
    }
    nav('/race')
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'Athlete dashboard', pt: 'Painel do atleta' })}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {tr({
            en: 'Load today’s assigned route (Bib QR), then enter Race Mode.',
            pt: 'Carregue a rota atribuída de hoje (Bib QR) e depois entre no Race Mode.',
          })}
        </p>
      </section>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Today’s race', pt: 'Prova de hoje' })}</h2>
        {pkg ? (
          <div className="mt-3 grid gap-2 text-sm">
            <div>
              <span className="font-semibold">{tr({ en: 'Event:', pt: 'Evento:' })}</span> {pkg.eventTitle}
            </div>
            <div>
              <span className="font-semibold">{tr({ en: 'Athlete:', pt: 'Atleta:' })}</span> {pkg.athlete.fullName}
            </div>
            <div>
              <span className="font-semibold">Bib:</span> {pkg.bib.bibNumber}
            </div>
            <div>
              <span className="font-semibold">{tr({ en: 'Route:', pt: 'Rota:' })}</span> {pkg.route.routeCode}
            </div>
            <div>
              <span className="font-semibold">Status:</span> {session?.status ?? 'not_started'}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-700">{tr({ en: 'No race package loaded.', pt: 'Nenhum pacote de prova carregado.' })}</div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setScanning((v) => !v)}>
            {scanning
              ? tr({ en: 'Stop scanning', pt: 'Parar scanner' })
              : tr({ en: 'Scan Bib QR', pt: 'Escanear Bib QR' })}
          </Button>
          <Button onClick={() => void enterRace()} disabled={!pkg}>
            {tr({ en: 'Enter Race Mode', pt: 'Entrar no Race Mode' })}
          </Button>
          <Button variant="secondary" onClick={() => nav('/athlete/course')} disabled={!pkg}>
            {tr({ en: 'View Course Info', pt: 'Ver informações do percurso' })}
          </Button>
          <Button variant="secondary" onClick={() => nav('/athlete/results')} disabled={!pkg}>
            {tr({ en: 'View Results', pt: 'Ver resultados' })}
          </Button>
        </div>

        {scanning ? (
          <div className="mt-5 rounded-lg bg-black p-4">
            <div className="mb-2 text-xs font-semibold text-white/80">{tr({ en: 'Scan Bib QR', pt: 'Escanear Bib QR' })}</div>
            <QrScanner active={scanning} onScan={onBibScan} onError={(m) => setError(m)} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
