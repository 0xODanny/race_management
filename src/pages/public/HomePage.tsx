import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { getSupabaseOrNull } from '../../lib/supabase'
import { isTrialModeEnabled } from '../../lib/demoMode'
import { demoEvents, getDemoEventText } from '../../demo/trialData'
import { useI18n } from '../../i18n/i18n'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/Label'
import type { Provider } from '@supabase/supabase-js'

type EventRow = {
  id: string
  title: string
  location: string | null
  start_date: string
  status: string
}

export function HomePage() {
  const nav = useNavigate()
  const auth = useAuth()
  const { tr, lang } = useI18n()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const canEmail = useMemo(() => email.includes('@') && password.length >= 6, [email, password])

  const trial = isTrialModeEnabled()

  useEffect(() => {
    if (auth.loading) return
    if (auth.user) nav('/athlete', { replace: true })
  }, [auth.loading, auth.user, nav])

  useEffect(() => {
    if (auth.mode !== 'local') return
    // Convenience for localhost verification.
    if (!email) setEmail('admin@admin.com')
    if (!password) setPassword('123456789@')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.mode])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)

      if (trial) {
        setEvents(
          demoEvents.map((e) => {
            const text = getDemoEventText(e, lang)
            return {
              id: e.id,
              title: text.title,
              location: e.location,
              start_date: e.start_date,
              status: e.status,
            }
          }),
        )
        setLoading(false)
        return
      }

      const supabase = getSupabaseOrNull()
      if (!supabase) {
        setError(
          tr({
            en: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load events.',
            pt: 'O Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para carregar eventos.',
          }),
        )
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
  }, [trial, tr, lang])

  async function signInWithEmail() {
    setSigningIn(true)
    setAuthError(null)
    try {
      const r = await auth.signInWithPassword({ email, password })
      if (!r.ok) throw new Error(r.error)
      nav('/athlete', { replace: true })
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : tr({ en: 'Login failed', pt: 'Falha no login' }))
    } finally {
      setSigningIn(false)
    }
  }

  async function signInWithProvider(provider: Provider) {
    setSigningIn(true)
    setAuthError(null)
    try {
      const redirectTo = `${window.location.origin}/athlete`
      const r = await auth.signInWithOAuth({ provider, redirectTo })
      if (!r.ok) throw new Error(r.error)
      // Supabase OAuth will redirect; if it doesn't, we still navigate.
      nav('/athlete', { replace: true })
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : tr({ en: 'Login failed', pt: 'Falha no login' }))
      setSigningIn(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'Race Management', pt: 'Gerenciamento de Corridas' })}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {tr({
            en: 'Sign in to access Athlete tools, offline Race Mode, and results.',
            pt: 'Entre para acessar ferramentas do atleta, Race Mode offline e resultados.',
          })}
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Login', pt: 'Login' })}</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              variant="secondary"
              disabled={signingIn || auth.mode === 'local'}
              onClick={() => void signInWithProvider('google')}
            >
              {tr({ en: 'Continue with Google', pt: 'Continuar com Google' })}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={signingIn || auth.mode === 'local'}
              onClick={() => void signInWithProvider('facebook')}
            >
              {tr({ en: 'Continue with Facebook', pt: 'Continuar com Facebook' })}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={signingIn || auth.mode === 'local'}
              onClick={() => void signInWithProvider('apple')}
            >
              {tr({ en: 'Continue with Apple', pt: 'Continuar com Apple' })}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={signingIn || auth.mode === 'local'}
              onClick={() => void signInWithProvider('github')}
            >
              {tr({ en: 'Continue with GitHub', pt: 'Continuar com GitHub' })}
            </Button>
          </div>

          {auth.mode === 'local' ? (
            <div className="text-xs text-zinc-600">
              {tr({
                en: 'OAuth providers are disabled in local demo auth. Use email/password below.',
                pt: 'Provedores OAuth ficam desabilitados no modo demo local. Use email/senha abaixo.',
              })}
            </div>
          ) : null}

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
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
          </div>

          {authError ? <div className="text-sm text-red-700">{authError}</div> : null}

          <Button size="lg" disabled={!canEmail || signingIn} onClick={() => void signInWithEmail()}>
            {signingIn ? tr({ en: 'Signing in…', pt: 'Entrando…' }) : tr({ en: 'Sign in with email', pt: 'Entrar com email' })}
          </Button>

          <div className="text-xs text-zinc-600">
            {tr({
              en: 'For production, OAuth providers must be enabled in Supabase Auth.',
              pt: 'Em produção, os provedores OAuth precisam estar habilitados no Supabase Auth.',
            })}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Events</h2>
          <Link to="/how" className="text-sm underline">
            {tr({ en: 'How it works', pt: 'Como funciona' })}
          </Link>
        </div>

        {loading ? <div className="mt-3 text-sm">{tr({ en: 'Loading…', pt: 'Carregando…' })}</div> : null}
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
          {!loading && !events.length ? (
            <li className="py-3 text-sm text-zinc-700">{tr({ en: 'No events yet.', pt: 'Nenhum evento ainda.' })}</li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
