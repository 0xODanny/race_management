import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { getDemoEvent, getDemoEventText } from '../../demo/trialData'
import { useI18n } from '../../i18n/i18n'
import { fetchEventMapPackageMetadata } from '../../features/offline-map/services/offlinePackageService'
import {
  deleteOfflineEventPackage,
  getOfflineEventPackage,
  upsertOfflineEventPackage,
} from '../../features/offline-map/storage/offlineMapRepo'
import { deleteOfflineTilesForPackage, downloadOfflineMapPackage } from '../../features/offline-map/services/tileDownloadService'
import type { OfflineEventMapPackage } from '../../features/offline-map/types'

type EventRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string
  status: string
}

export function EventPage() {
  const { eventId } = useParams()
  const { tr, lang } = useI18n()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offlinePkgStatus, setOfflinePkgStatus] = useState<
    | { kind: 'idle'; pkg: OfflineEventMapPackage | null }
    | { kind: 'downloading'; pkg: OfflineEventMapPackage | null; completed: number; total: number }
    | { kind: 'error'; pkg: OfflineEventMapPackage | null; message: string }
  >({ kind: 'idle', pkg: null })

  function formatStatus(status: string | null | undefined): string {
    const v = (status ?? '').toLowerCase()
    if (v === 'scheduled') return tr({ en: 'scheduled', pt: 'agendado' })
    if (v === 'live') return tr({ en: 'live', pt: 'ao vivo' })
    if (v === 'completed') return tr({ en: 'completed', pt: 'concluído' })
    if (!status) return tr({ en: 'unknown', pt: 'desconhecido' })
    return status
  }

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    async function load() {
      setError(null)

      if (isTrialModeEnabled()) {
        const e = getDemoEvent(eventId!)
        if (!e) {
          setEvent(null)
          setError(tr({ en: 'Demo event not found', pt: 'Evento demo não encontrado' }))
        } else {
          const text = getDemoEventText(e, lang)
          setEvent({
            id: e.id,
            title: text.title,
            description: text.description,
            location: e.location,
            start_date: e.start_date,
            status: e.status,
          })
        }
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError(
          tr({
            en: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load this event.',
            pt: 'O Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para carregar este evento.',
          }),
        )
        setEvent(null)
        return
      }

      const { data, error } = await supabase
        .from('events')
        .select('id,title,description,location,start_date,status')
        .eq('id', eventId!)
        .maybeSingle()
      if (cancelled) return
      if (error) setError(error.message)
      setEvent((data as unknown as EventRow) ?? null)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [eventId, tr, lang])

  useEffect(() => {
    const id = eventId
    if (!id) return
    const eventIdStr: string = id
    let cancelled = false
    async function loadPkg() {
      const pkg = await getOfflineEventPackage(eventIdStr)
      if (cancelled) return
      setOfflinePkgStatus({ kind: 'idle', pkg })
    }
    void loadPkg()
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (!eventId) return <div>{tr({ en: 'Missing event.', pt: 'Evento ausente.' })}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{event?.title ?? 'Event'}</h1>
            <div className="mt-2 text-sm text-zinc-700">
              {event?.start_date ?? ''} {event?.location ? `• ${event.location}` : ''}
            </div>
          </div>
          <div className="text-right text-xs text-zinc-600">
            {tr({ en: 'Status:', pt: 'Status:' })} {formatStatus(event?.status)}
          </div>
        </div>

        {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

        <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-800">{event?.description ?? ''}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to={`/events/${eventId}/register`}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            {tr({ en: 'Registration', pt: 'Inscrição' })}
          </Link>
          <Link
            to={`/events/${eventId}/results`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            {tr({ en: 'Live results', pt: 'Resultados ao vivo' })}
          </Link>
          <Link
            to={`/events/${eventId}/projector`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            {tr({ en: 'Projector board', pt: 'Painel (projetor)' })}
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Event info', pt: 'Informações do evento' })}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
          <li>
            {tr({
              en: 'Schedule, parking, toilets, and sponsors are configured per event.',
              pt: 'Horários, estacionamento, banheiros e patrocinadores são configurados por evento.',
            })}
          </li>
          <li>
            {tr({
              en: 'Race Mode is offline-first; download your race package before start.',
              pt: 'O Race Mode é offline-first; baixe seu pacote de prova antes do Start.',
            })}
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Offline race map', pt: 'Mapa offline da prova' })}</h2>
        <p className="mt-2 text-sm text-zinc-700">
          {tr({
            en: 'Download the map once so it can open without signal during the race.',
            pt: 'Baixe o mapa uma vez para abrir sem sinal durante a prova.',
          })}
        </p>

        <div className="mt-3 text-sm text-zinc-800">
          {offlinePkgStatus.kind === 'downloading' ? (
            <div>
              {tr({ en: 'Downloading tiles…', pt: 'Baixando tiles…' })}{' '}
              <span className="font-semibold">
                {offlinePkgStatus.completed}/{offlinePkgStatus.total}
              </span>
            </div>
          ) : offlinePkgStatus.pkg?.downloadStatus ? (
            <div>
              {tr({ en: 'Status:', pt: 'Status:' })}{' '}
              <span className="font-semibold">{String(offlinePkgStatus.pkg.downloadStatus)}</span>
            </div>
          ) : (
            <div>{tr({ en: 'Status: not downloaded', pt: 'Status: não baixado' })}</div>
          )}

          {offlinePkgStatus.kind === 'error' ? (
            <div className="mt-2 text-sm text-red-700">{offlinePkgStatus.message}</div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to={`/events/${eventId}/map`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            {tr({ en: 'Open map', pt: 'Abrir mapa' })}
          </Link>

          <button
            type="button"
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={offlinePkgStatus.kind === 'downloading' || !event}
            onClick={async () => {
              if (!eventId || !event) return
              try {
                setOfflinePkgStatus((prev) =>
                  prev.kind === 'downloading' ? prev : { kind: 'downloading', pkg: prev.pkg, completed: 0, total: 0 },
                )

                let pkg = await getOfflineEventPackage(eventId)
                if (!pkg) {
                  pkg = await fetchEventMapPackageMetadata({
                    eventId,
                    eventName: event.title,
                    venueName: event.location ?? '',
                  })
                  await upsertOfflineEventPackage(pkg)
                }

                setOfflinePkgStatus({
                  kind: 'downloading',
                  pkg,
                  completed: pkg.tileManifest.completedTileCount ?? 0,
                  total: pkg.tileManifest.totalTileCount ?? 0,
                })

                await downloadOfflineMapPackage({
                  pkg,
                  onProgress: (p) => {
                    setOfflinePkgStatus({ kind: 'downloading', pkg, completed: p.completed, total: p.total })
                  },
                })

                const updated = await getOfflineEventPackage(eventId)
                setOfflinePkgStatus({ kind: 'idle', pkg: updated })
              } catch (e) {
                const updated = await getOfflineEventPackage(eventId)
                setOfflinePkgStatus({
                  kind: 'error',
                  pkg: updated,
                  message:
                    e instanceof Error
                      ? e.message
                      : tr({ en: 'Map download error', pt: 'Erro ao baixar o mapa' }),
                })
              }
            }}
          >
            {offlinePkgStatus.pkg?.downloadStatus === 'ready'
              ? tr({ en: 'Re-download', pt: 'Baixar novamente' })
              : offlinePkgStatus.pkg?.downloadStatus === 'downloading'
                ? tr({ en: 'Downloading…', pt: 'Baixando…' })
                : offlinePkgStatus.pkg?.downloadStatus === 'damaged'
                  ? tr({ en: 'Resume download', pt: 'Retomar download' })
                  : tr({ en: 'Download map', pt: 'Baixar mapa' })}
          </button>

          {offlinePkgStatus.pkg ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={offlinePkgStatus.kind === 'downloading'}
              onClick={async () => {
                if (!eventId) return
                const pkg = await getOfflineEventPackage(eventId)
                if (!pkg) return

                try {
                  await deleteOfflineTilesForPackage({ eventId, packageVersion: pkg.packageVersion })
                } finally {
                  await deleteOfflineEventPackage(eventId)
                }
                const updated = await getOfflineEventPackage(eventId)
                setOfflinePkgStatus({ kind: 'idle', pkg: updated })
              }}
            >
              {tr({ en: 'Delete offline map', pt: 'Excluir mapa offline' })}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
