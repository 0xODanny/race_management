import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/Label'

type Sex = 'F' | 'M' | 'X'

export function RegisterPage() {
  const { eventId } = useParams()
  const auth = useAuth()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [sex, setSex] = useState<Sex>('X')
  const [categoryId, setCategoryId] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [waiverAccepted, setWaiverAccepted] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!eventId) return false
    if (!auth.user) return false
    return (
      fullName.trim().length >= 2 &&
      phone.trim().length >= 6 &&
      birthdate.length === 10 &&
      emergencyName.trim().length >= 2 &&
      emergencyPhone.trim().length >= 6 &&
      waiverAccepted
    )
  }, [auth.user, birthdate, emergencyName, emergencyPhone, eventId, fullName, phone, waiverAccepted])

  async function submit() {
    if (!eventId) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase.functions.invoke('register-for-event', {
        body: {
          eventId,
          fullName,
          phone,
          birthdate,
          sex,
          categoryId: categoryId || null,
          emergencyContact: { name: emergencyName, phone: emergencyPhone },
          waiverAccepted,
        },
      })
      if (error) throw error
      setSuccess('Registration submitted. You can now check in with staff on race day.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (!eventId) return <div>Missing event.</div>

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Event registration</h1>
        {!auth.user ? (
          <p className="mt-2 text-sm text-zinc-800">
            Please <Link to="/login" className="underline">log in</Link> to register.
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-800">Logged in as {auth.user.email}</p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <div>
            <Label>Birthdate</Label>
            <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
          </div>
          <div>
            <Label>Sex</Label>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
            >
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="X">X</option>
            </select>
          </div>
          <div>
            <Label>Category (optional)</Label>
            <Input value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Category ID" />
          </div>
          <div className="md:col-span-2">
            <div className="mt-2 text-xs text-zinc-600">
              Categories are normally selected from the event list; this MVP uses a simple field.
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-bold">Emergency contact</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={waiverAccepted}
              onChange={(e) => setWaiverAccepted(e.target.checked)}
            />
            <span>
              I accept the event waiver and acknowledge the risks of outdoor racing.
              <span className="block text-xs text-zinc-600">(Full waiver text is configured per event.)</span>
            </span>
          </label>
        </div>

        {error ? <div className="mt-4 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-4 text-sm text-green-800">{success}</div> : null}

        <div className="mt-5">
          <Button size="lg" onClick={() => void submit()} disabled={!canSubmit || loading}>
            {loading ? 'Submitting…' : 'Submit registration'}
          </Button>
        </div>
      </section>
    </div>
  )
}
