import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSupabaseOrNull } from '../../lib/supabase'

type ResultRow = {
  id: string
  race_session_id: string
  status: string
  official_time_ms: number | null
  provisional_time_ms: number | null
  rank: number | null
  rank_scope: string | null
  updated_at: string
  athlete_name: string | null
  bib_number: string | null
  last_checkpoint_code: string | null
}

function formatMs(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function LiveResultsPage() {
  const { eventId } = useParams()
  const [rows, setRows] = useState<ResultRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ar = a.rank ?? 999999
      const br = b.rank ?? 999999
      if (ar !== br) return ar - br
      return (a.official_time_ms ?? a.provisional_time_ms ?? 9e15) - (b.official_time_ms ?? b.provisional_time_ms ?? 9e15)
    })
  }, [rows])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false

    async function load() {
      setError(null)
      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load results.')
        setRows([])
        return
      }

      const { data, error } = await supabase
        .from('results_public')
        .select(
          'id,race_session_id,status,official_time_ms,provisional_time_ms,rank,rank_scope,updated_at,athlete_name,bib_number,last_checkpoint_code',
        )
        .eq('event_id', eventId!)
        .limit(200)

      if (cancelled) return
      if (error) {
        setError(error.message)
        setRows([])
      } else {
        setRows((data ?? []) as ResultRow[])
      }
    }

    void load()

    const supabase = getSupabaseOrNull()
    if (!supabase) return

    const channel = supabase
      .channel(`public-results:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'results_public', filter: `event_id=eq.${eventId}` },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [eventId])

  if (!eventId) return <div>Missing event.</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live results</h1>
        <Link to={`/events/${eventId}/projector`} className="text-sm underline">
          Projector mode
        </Link>
      </div>

      {error ? <div className="text-sm text-red-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-3 py-2">Pos</th>
              <th className="px-3 py-2">Bib</th>
              <th className="px-3 py-2">Athlete</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Last</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.rank ?? '—'}</td>
                <td className="px-3 py-2">{r.bib_number ?? '—'}</td>
                <td className="px-3 py-2">{r.athlete_name ?? '—'}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 font-semibold">
                  {formatMs(r.status === 'official' ? r.official_time_ms : r.provisional_time_ms)}
                </td>
                <td className="px-3 py-2">{r.last_checkpoint_code ?? '—'}</td>
              </tr>
            ))}
            {!sorted.length ? (
              <tr>
                <td className="px-3 py-4 text-zinc-700" colSpan={6}>
                  No results yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
