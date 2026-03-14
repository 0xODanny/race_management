import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/Label'

export function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation() as any
  const auth = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const can = useMemo(() => email.includes('@') && password.length >= 6, [email, password])

  useEffect(() => {
    if (auth.mode !== 'local') return
    // Convenience for localhost verification.
    if (!email) setEmail('admin@admin.com')
    if (!password) setPassword('123456789@')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.mode])

  async function signIn() {
    setLoading(true)
    setError(null)
    try {
      const r = await auth.signInWithPassword({ email, password })
      if (!r.ok) throw new Error(r.error)
      const to = loc?.state?.from || '/athlete'
      nav(to, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Athlete login</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {auth.mode === 'local' ? 'Local demo auth is enabled for localhost verification.' : 'Use your event account.'}
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>

          {error ? <div className="text-sm text-red-700">{error}</div> : null}

          <Button size="lg" onClick={() => void signIn()} disabled={!can || loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>

          <div className="text-xs text-zinc-600">
            {auth.mode === 'local'
              ? 'Demo credentials are stored locally (no Supabase required).'
              : 'For MVP, accounts are created by admins/staff (or via Supabase Auth dashboard).'}
          </div>
        </div>
      </section>
    </div>
  )
}
