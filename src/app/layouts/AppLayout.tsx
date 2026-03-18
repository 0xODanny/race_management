import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { AutoResumeRace } from '../components/AutoResumeRace'
import { isTestModeEnabled, isTrialModeEnabled, reloadApp, setTestModeEnabled, setTrialModeEnabled } from '../../lib/demoMode'
import { BackNav } from '../components/BackNav'
import { LanguageToggle, useI18n } from '../../i18n/i18n'

export function AppLayout() {
  const auth = useAuth()
  const { tr } = useI18n()
  const showDemoButtons = auth.mode === 'local' || import.meta.env.DEV || isTestModeEnabled() || isTrialModeEnabled()
  const testOn = isTestModeEnabled()
  const trialOn = isTrialModeEnabled()

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <AutoResumeRace />
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:max-w-3xl lg:max-w-5xl">
          <Link to="/athlete" className="text-sm font-bold tracking-wide">
            {tr({ en: 'DASHBOARD', pt: 'PAINEL' })}
          </Link>
          <div className="flex items-center gap-3 text-sm">
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
                  title="Unlock all pages locally"
                >
                  {tr({ en: 'Test mode', pt: 'Modo teste' })}
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
                  title="Populate demo races and sample data"
                >
                  {tr({ en: 'Race trial', pt: 'Demo de corrida' })}
                </button>
              </>
            ) : null}
            <LanguageToggle />
            <Link to="/race" className="hover:underline">
              {tr({ en: 'Race mode', pt: 'Race Mode' })}
            </Link>
            <button
              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm"
              onClick={() => void auth.signOut()}
            >
              {tr({ en: 'Sign out', pt: 'Sair' })}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 md:max-w-3xl lg:max-w-5xl">
        <BackNav />
        {auth.loading ? <div>{tr({ en: 'Loading…', pt: 'Carregando…' })}</div> : <Outlet />}
      </main>
    </div>
  )
}
