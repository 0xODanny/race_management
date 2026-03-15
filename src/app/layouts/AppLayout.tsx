import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { AutoResumeRace } from '../components/AutoResumeRace'

export function AppLayout() {
  const auth = useAuth()

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <AutoResumeRace />
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <Link to="/athlete" className="text-sm font-bold tracking-wide">
            DASHBOARD
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/race" className="hover:underline">
              Race mode
            </Link>
            <button
              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm"
              onClick={() => void auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5">
        {auth.loading ? <div>Loading…</div> : <Outlet />}
      </main>
    </div>
  )
}
