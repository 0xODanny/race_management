import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { getDemoResults } from '../../demo/trialData'

type ResultRow = {
  id: string
  status: string
  official_time_ms: number | null
  provisional_time_ms: number | null
  rank: number | null
  athlete_name: string | null
  bib_number: string | null
  last_checkpoint_code: string | null
  updated_at: string
}

function formatMs(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function ProjectorBoardPage() {
  const { eventId } = useParams()
  const [rows, setRows] = useState<ResultRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const lastSeenUpdatedAtRef = useRef<string | null>(null)

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

      if (isTrialModeEnabled()) {
        setRows(getDemoResults(eventId!) as any)
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load results.')
        setRows([])
        return
      }

      const { data, error } = await supabase
        .from('results_public')
        .select('id,status,official_time_ms,provisional_time_ms,rank,athlete_name,bib_number,last_checkpoint_code,updated_at')
        .eq('event_id', eventId!)
        .limit(200)

      if (cancelled) return
      if (error) {
        setError(error.message)
        setRows([])
      } else {
        const next = (data ?? []) as ResultRow[]
        // Highlight the most recent update for a short window.
        const latest = next
          .slice()
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0]

        if (latest && latest.updated_at !== lastSeenUpdatedAtRef.current) {
          lastSeenUpdatedAtRef.current = latest.updated_at
          setHighlightId(latest.id)
          window.setTimeout(() => setHighlightId(null), 8000)
        }

        setRows(next)
      }
    }

    void load()

    if (isTrialModeEnabled()) return

    const supabase = getSupabaseOrNull()
    if (!supabase) return

    const channel = supabase
      .channel(`projector-results:${eventId}`)
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
    <div className="min-h-[calc(100vh-6rem)] rounded-lg bg-black p-6 text-white">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm opacity-70">Live leaderboard</div>
          <div className="text-3xl font-extrabold tracking-wide">EVENT {eventId}</div>
        </div>
        <div className="text-sm opacity-70">Provisional → Official after validation</div>
      </div>

      {error ? <div className="mt-4 text-sm text-red-300">{error}</div> : null}

      <div className="mt-6 overflow-hidden rounded-md border border-white/10">
        <table className="w-full text-left">
          <thead className="bg-white/5 text-sm uppercase tracking-wide text-white/80">
            <tr>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3">Bib</th>
              <th className="px-4 py-3">Athlete</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Last</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-lg">
            {sorted.slice(0, 20).map((r) => {
              const isHighlight = highlightId === r.id
              const time = r.status === 'official' ? r.official_time_ms : r.provisional_time_ms
              return (
                <tr key={r.id} className={isHighlight ? 'bg-lime-400/15' : ''}>
                  <td className="px-4 py-3 font-bold">{r.rank ?? '—'}</td>
                  <td className="px-4 py-3 font-bold">{r.bib_number ?? '—'}</td>
                  <td className="px-4 py-3">{r.athlete_name ?? '—'}</td>
                  <td className="px-4 py-3 opacity-90">{r.status}</td>
                  <td className="px-4 py-3 font-extrabold">{formatMs(time)}</td>
                  <td className="px-4 py-3 opacity-90">{r.last_checkpoint_code ?? '—'}</td>
                </tr>
              )
            })}
            {!sorted.length ? (
              <tr>
                <td className="px-4 py-6 text-white/70" colSpan={6}>
                  Waiting for riders…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-white/60">
        On-course riders update when they scan anchor splits or checkpoints.
      </div>
    </div>
  )
}
