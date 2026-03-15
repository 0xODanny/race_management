import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { getDemoCheckInRows, toggleDemoCheckIn } from '../../demo/trialData'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'

type CheckInRow = {
  registration_id: string
  athlete_id: string
  full_name: string
  email: string | null
  phone: string | null
  checked_in: boolean
  bib_number: string | null
}

export function CheckInPage() {
  const { eventId } = useParams()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<CheckInRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      [r.full_name, r.email ?? '', r.phone ?? '', r.bib_number ?? ''].some((v) => v.toLowerCase().includes(needle)),
    )
  }, [q, rows])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)

      if (isTrialModeEnabled()) {
        setRows(getDemoCheckInRows(eventId!) as any)
        setLoading(false)
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load staff check-in.')
        setRows([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('staff_checkin_view')
        .select('registration_id,athlete_id,full_name,email,phone,checked_in,bib_number')
        .eq('event_id', eventId!)
        .limit(500)

      if (cancelled) return
      if (error) {
        setError(error.message)
        setRows([])
      } else {
        setRows((data ?? []) as CheckInRow[])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function toggleCheckIn(registrationId: string, checkedIn: boolean) {
    try {
      if (isTrialModeEnabled()) {
        const next = toggleDemoCheckIn(registrationId)
        setRows((prev) => prev.map((r) => (r.registration_id === registrationId ? { ...r, checked_in: next } : r)))
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) throw new Error('Supabase is not configured.')

      const { error } = await supabase
        .from('registrations')
        .update({ checked_in: !checkedIn })
        .eq('id', registrationId)
      if (error) throw error
      setRows((prev) => prev.map((r) => (r.registration_id === registrationId ? { ...r, checked_in: !checkedIn } : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  if (!eventId) return <div>Missing event.</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Staff check-in</h1>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold">Search athlete</div>
        <div className="mt-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, phone, bib" />
        </div>
        <div className="mt-2 text-xs text-zinc-600">Assigning bibs is handled in the admin tools in this MVP.</div>
      </div>

      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="text-sm">Loading…</div> : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-3 py-2">Athlete</th>
              <th className="px-3 py-2">Bib</th>
              <th className="px-3 py-2">Checked in</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {filtered.map((r) => (
              <tr key={r.registration_id}>
                <td className="px-3 py-2">
                  <div className="font-semibold">{r.full_name}</div>
                  <div className="text-xs text-zinc-600">{r.email ?? r.phone ?? '—'}</div>
                </td>
                <td className="px-3 py-2">{r.bib_number ?? '—'}</td>
                <td className="px-3 py-2">{r.checked_in ? 'YES' : 'NO'}</td>
                <td className="px-3 py-2">
                  <Button variant="secondary" onClick={() => void toggleCheckIn(r.registration_id, r.checked_in)}>
                    {r.checked_in ? 'Undo' : 'Check-in'}
                  </Button>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td className="px-3 py-4 text-zinc-700" colSpan={4}>
                  No athletes.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
