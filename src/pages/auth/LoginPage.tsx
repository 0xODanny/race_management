import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/Label'
import { useI18n } from '../../i18n/i18n'

export function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation() as any
  const auth = useAuth()
  const { tr } = useI18n()

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
      setError(e instanceof Error ? e.message : tr({ en: 'Login failed', pt: 'Falha no login' }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'Athlete login', pt: 'Login do atleta' })}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {auth.mode === 'local'
            ? tr({
                en: 'Local demo auth is enabled for localhost verification.',
                pt: 'Autenticação demo local está habilitada para verificação no localhost.',
              })
            : tr({ en: 'Use your event account.', pt: 'Use sua conta do evento.' })}
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <Label>{tr({ en: 'Password', pt: 'Senha' })}</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>

          {error ? <div className="text-sm text-red-700">{error}</div> : null}

          <Button size="lg" onClick={() => void signIn()} disabled={!can || loading}>
            {loading
              ? tr({ en: 'Signing in…', pt: 'Entrando…' })
              : tr({ en: 'Sign in', pt: 'Entrar' })}
          </Button>

          <div className="text-xs text-zinc-600">
            {auth.mode === 'local'
              ? tr({
                  en: 'Demo credentials are stored locally (no Supabase required).',
                  pt: 'As credenciais demo ficam salvas localmente (não precisa Supabase).',
                })
              : tr({
                  en: 'For MVP, accounts are created by admins/staff (or via Supabase Auth dashboard).',
                  pt: 'No MVP, as contas são criadas por admins/equipe (ou pelo painel do Supabase Auth).',
                })}
          </div>
        </div>
      </section>
    </div>
  )
}
