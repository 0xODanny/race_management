import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { readRoleFromMetadata, type UserRole } from './auth'

type AuthState = {
  session: Session | null
  user: User | null
  role: UserRole | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  role: null,
  loading: true,
})

export function AuthProvider(props: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    role: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setState({ session: null, user: null, role: null, loading: false })
        return
      }
      const session = data.session
      const user = session?.user ?? null
      const role = user ? readRoleFromMetadata(user.user_metadata) : null
      setState({ session, user, role, loading: false })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      const role = user ? readRoleFromMetadata(user.user_metadata) : null
      setState({ session, user, role, loading: false })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => state, [state])
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
