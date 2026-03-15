import { Link, Outlet } from 'react-router-dom'
import { AutoResumeRace } from '../components/AutoResumeRace'
import { isTestModeEnabled, isTrialModeEnabled, reloadApp, setTestModeEnabled, setTrialModeEnabled } from '../../lib/demoMode'
import { BackNav } from '../components/BackNav'

export function PublicLayout() {
  const showDemoButtons = import.meta.env.DEV || isTestModeEnabled() || isTrialModeEnabled()
  const testOn = isTestModeEnabled()
  const trialOn = isTrialModeEnabled()

  return (
    <div className="min-h-full bg-white text-zinc-900">
      <AutoResumeRace />
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-sm font-bold tracking-wide">
            RACE
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {showDemoButtons ? (
              <>
                <button
                  className={
                    testOn
                      ? 'rounded-md bg-black px-3 py-1 text-sm font-semibold text-white'
                      : 'rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm'
                  }
                  onClick={() => {
                    setTestModeEnabled(!testOn)
                    if (trialOn && testOn) setTrialModeEnabled(false)
                    reloadApp()
                  }}
                >
                  Test mode
                </button>
                <button
                  className={
                    trialOn
                      ? 'rounded-md bg-black px-3 py-1 text-sm font-semibold text-white'
                      : 'rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm'
                  }
                  onClick={() => {
                    setTrialModeEnabled(!trialOn)
                    reloadApp()
                  }}
                >
                  Race trial
                </button>
              </>
            ) : null}
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
        <BackNav />
        <Outlet />
      </main>
    </div>
  )
}
