import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { AutoResumeRace } from '../components/AutoResumeRace'

export function AppLayout() {
  const auth = useAuth()

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <AutoResumeRace />
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/athlete" className="text-sm font-bold tracking-wide">
            DASHBOARD
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/race" className="hover:underline">
              Race mode
            </Link>
            <button
              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {auth.loading ? <div>Loading…</div> : <Outlet />}
      </main>
    </div>
  )
}
