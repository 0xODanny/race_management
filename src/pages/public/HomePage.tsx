import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { demoEvents } from '../../demo/trialData'

type EventRow = {
  id: string
  title: string
  location: string | null
  start_date: string
  status: string
}

export function HomePage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const trial = isTrialModeEnabled()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)

      if (trial) {
        setEvents(
          demoEvents.map((e) => ({
            id: e.id,
            title: e.title,
            location: e.location,
            start_date: e.start_date,
            status: e.status,
          })),
        )
        setLoading(false)
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load events.')
        setEvents([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('events')
        .select('id,title,location,start_date,status')
        .order('start_date', { ascending: true })
        .limit(50)
      if (cancelled) return
      if (error) {
        setError(error.message)
        setEvents([])
      } else {
        setEvents((data ?? []) as EventRow[])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [trial])

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Outdoor race events</h1>
        <p className="mt-2 text-sm text-zinc-700">
          Installable PWA for athlete registration, offline checkpoint timing, anti-cheat route enforcement, and live
          results.
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Events</h2>
          <Link to="/how" className="text-sm underline">
            How it works
          </Link>
        </div>

        {loading ? <div className="mt-3 text-sm">Loading…</div> : null}
        {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

        <ul className="mt-4 divide-y divide-zinc-200">
          {events.map((e) => (
            <li key={e.id} className="py-3">
              <Link to={`/events/${e.id}`} className="block">
                <div className="font-semibold">{e.title}</div>
                <div className="text-sm text-zinc-700">
                  {e.start_date} {e.location ? `• ${e.location}` : ''}
                </div>
              </Link>
            </li>
          ))}
          {!loading && !events.length ? <li className="py-3 text-sm text-zinc-700">No events yet.</li> : null}
        </ul>
      </section>
    </div>
  )
}
