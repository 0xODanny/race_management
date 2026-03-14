import { Link, Outlet } from 'react-router-dom'
import { AutoResumeRace } from '../components/AutoResumeRace'

export function PublicLayout() {
  return (
    <div className="min-h-full bg-white text-zinc-900">
      <AutoResumeRace />
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-sm font-bold tracking-wide">
            RACE
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/how" className="hover:underline">
              How it works
            </Link>
            <Link to="/login" className="hover:underline">
              Athlete login
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
