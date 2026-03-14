import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRaceStore } from '../../state/raceStore'

export function AutoResumeRace() {
  const nav = useNavigate()
  const loc = useLocation()
  const hydrated = useRaceStore((s) => s.hydrated)
  const hydrate = useRaceStore((s) => s.hydrate)
  const session = useRaceStore((s) => s.activeSession)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!hydrated) return
    if (!session || !session.active) return

    const inRaceMode = loc.pathname.startsWith('/race')
    const shouldResume = session.status === 'racing' || session.status === 'finished_validating'

    if (shouldResume && !inRaceMode) {
      nav('/race', { replace: true })
    }
  }, [hydrated, session, loc.pathname, nav])

  return null
}
