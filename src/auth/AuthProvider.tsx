import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { env, isSupabaseConfigured } from '../lib/env'
import { getSupabase } from '../lib/supabase'
import { readRoleFromMetadata, type UserRole } from './auth'

type AuthUser = {
  id: string
  email: string | null
  user_metadata?: unknown
}

type AuthState = {
  user: AuthUser | null
  role: UserRole | null
  loading: boolean
  mode: 'supabase' | 'local'

  signInWithPassword: (params: { email: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
  mode: 'supabase',
  signInWithPassword: async () => ({ ok: false, error: 'Auth not ready' }),
  signOut: async () => {},
})

const LOCAL_AUTH_KEY = 'rm_local_auth_v1'
const LOCAL_ADMIN_EMAIL = 'admin@admin.com'
const LOCAL_ADMIN_PASSWORD = '123456789@'

function readLocalUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return null
    if (typeof v.id !== 'string') return null
    if (typeof v.email !== 'string') return null
    return { id: v.id, email: v.email, user_metadata: v.user_metadata }
  } catch {
    return null
  }
}

function writeLocalUser(user: AuthUser | null) {
  if (!user) {
    window.localStorage.removeItem(LOCAL_AUTH_KEY)
    return
  }
  window.localStorage.setItem(
    LOCAL_AUTH_KEY,
    JSON.stringify({ id: user.id, email: user.email, user_metadata: user.user_metadata ?? { role: 'admin' } }),
  )
}

export function AuthProvider(props: { children: React.ReactNode }) {
  const useLocal = env.localAuthEnabled || !isSupabaseConfigured()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!useLocal) return

    // Local demo auth.
    const existing = readLocalUser()
    if (existing) {
      setUser(existing)
      setRole(readRoleFromMetadata(existing.user_metadata))
      setLoading(false)
      return
    }

    // Optional auto-admin for easy localhost verification.
    const auto = env.localAuthAutoAdmin || (import.meta.env.DEV && env.localAuthEnabled)
    if (auto) {
      const u: AuthUser = { id: 'local_admin', email: LOCAL_ADMIN_EMAIL, user_metadata: { role: 'admin' } }
      writeLocalUser(u)
      setUser(u)
      setRole('admin')
      setLoading(false)
      return
    }

    setUser(null)
    setRole(null)
    setLoading(false)
  }, [useLocal])

  useEffect(() => {
    if (useLocal) return

    let cancelled = false
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setUser(null)
        setRole(null)
        setLoading(false)
        return
      }
      const session = data.session
      const u = (session?.user as any as AuthUser) ?? null
      const r = u ? readRoleFromMetadata((u as any).user_metadata) : null
      setUser(u)
      setRole(r)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = (session?.user as any as AuthUser) ?? null
      const r = u ? readRoleFromMetadata((u as any).user_metadata) : null
      setUser(u)
      setRole(r)
      setLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [useLocal])

  const value = useMemo<AuthState>(() => {
    return {
      user,
      role,
      loading,
      mode: useLocal ? 'local' : 'supabase',
      signInWithPassword: async ({ email, password }) => {
        if (useLocal) {
          if (email.trim().toLowerCase() !== LOCAL_ADMIN_EMAIL) return { ok: false, error: 'Invalid email' }
          if (password !== LOCAL_ADMIN_PASSWORD) return { ok: false, error: 'Invalid password' }
          const u: AuthUser = { id: 'local_admin', email: LOCAL_ADMIN_EMAIL, user_metadata: { role: 'admin' } }
          writeLocalUser(u)
          setUser(u)
          setRole('admin')
          return { ok: true }
        }

        try {
          const supabase = getSupabase()
          const { error } = await supabase.auth.signInWithPassword({ email, password })
          if (error) return { ok: false, error: error.message }
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Login failed' }
        }
      },
      signOut: async () => {
        if (useLocal) {
          writeLocalUser(null)
          setUser(null)
          setRole(null)
          return
        }
        const supabase = getSupabase()
        await supabase.auth.signOut()
      },
    }
  }, [loading, role, useLocal, user])

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
