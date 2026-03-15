import { Link, Outlet } from 'react-router-dom'
import { AutoResumeRace } from '../components/AutoResumeRace'
import { isTestModeEnabled, isTrialModeEnabled, reloadApp, setTestModeEnabled, setTrialModeEnabled } from '../../lib/demoMode'
import { BackNav } from '../components/BackNav'
import { LanguageToggle, useI18n } from '../../i18n/i18n'

export function PublicLayout() {
  const { tr } = useI18n()
  const showDemoButtons = import.meta.env.DEV || isTestModeEnabled() || isTrialModeEnabled()
  const testOn = isTestModeEnabled()
  const trialOn = isTrialModeEnabled()

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <AutoResumeRace />
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="text-sm font-bold tracking-wide">
              RACE
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {showDemoButtons ? (
                <>
                  <button
                    className={
                      testOn
                        ? 'rounded-md bg-black px-2.5 py-1 text-sm font-semibold text-white'
                        : 'rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm'
                    }
                    onClick={() => {
                      setTestModeEnabled(!testOn)
                      if (trialOn && testOn) setTrialModeEnabled(false)
                      reloadApp()
                    }}
                  >
                    {tr({ en: 'Test mode', pt: 'Modo teste' })}
                  </button>
                  <button
                    className={
                      trialOn
                        ? 'rounded-md bg-black px-2.5 py-1 text-sm font-semibold text-white'
                        : 'rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm'
                    }
                    onClick={() => {
                      setTrialModeEnabled(!trialOn)
                      reloadApp()
                    }}
                  >
                    {tr({ en: 'Race trial', pt: 'Demo de corrida' })}
                  </button>
                </>
              ) : null}
              <LanguageToggle />
            </div>
          </div>

          <nav className="mt-3 flex items-center justify-between text-sm">
            <Link to="/how" className="hover:underline">
              {tr({ en: 'How it works', pt: 'Como funciona' })}
            </Link>
            <Link to="/login" className="hover:underline">
              {tr({ en: 'Athlete login', pt: 'Login do atleta' })}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5">
        <BackNav />
        <Outlet />
      </main>
    </div>
  )
}
