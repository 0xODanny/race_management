import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { getDemoEvent } from '../../demo/trialData'

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
  const [event, setEvent] = useState<EventRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    async function load() {
      setError(null)

      if (isTrialModeEnabled()) {
        const e = getDemoEvent(eventId!)
        if (!e) {
          setEvent(null)
          setError('Demo event not found')
        } else {
          setEvent({
            id: e.id,
            title: e.title,
            description: e.description,
            location: e.location,
            start_date: e.start_date,
            status: e.status,
          })
        }
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load this event.')
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
  }, [eventId])

  if (!eventId) return <div>Missing event.</div>

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
          <div className="text-right text-xs text-zinc-600">Status: {event?.status ?? 'unknown'}</div>
        </div>

        {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

        <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-800">{event?.description ?? ''}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to={`/events/${eventId}/register`}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Registration
          </Link>
          <Link
            to={`/events/${eventId}/results`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            Live results
          </Link>
          <Link
            to={`/events/${eventId}/projector`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            Projector board
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">Event info</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
          <li>Schedule, parking, toilets, and sponsors are configured per event.</li>
          <li>Race Mode is offline-first; download your race package before start.</li>
        </ul>
      </section>
    </div>
  )
}
