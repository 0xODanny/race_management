import { useParams } from 'react-router-dom'
import { useI18n } from '../../i18n/i18n'
import { OfflineRaceMap } from '../../features/offline-map/components/OfflineRaceMap'

export function OfflineMapPage() {
  const { eventId } = useParams()
  const { tr } = useI18n()

  if (!eventId) return <div>{tr({ en: 'Missing event.', pt: 'Evento ausente.' })}</div>

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-xl font-bold">{tr({ en: 'Offline race map', pt: 'Mapa offline da prova' })}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {tr({
            en: 'This map uses downloaded tiles so it can work with no signal.',
            pt: 'Este mapa usa tiles baixados para funcionar sem sinal.',
          })}
        </p>
      </section>

      <OfflineRaceMap eventId={eventId} />
    </div>
  )
}
