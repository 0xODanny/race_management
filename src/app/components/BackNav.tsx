import { Link, matchPath, useLocation } from 'react-router-dom'

type BackTarget = { to: string; label: string } | null

function getBackTarget(pathname: string): BackTarget {
  if (pathname === '/') return null

  const eventRoot = matchPath({ path: '/events/:eventId', end: true }, pathname)
  if (eventRoot?.params?.eventId) {
    return { to: '/', label: 'Home' }
  }

  const eventRegister = matchPath({ path: '/events/:eventId/register', end: true }, pathname)
  if (eventRegister?.params?.eventId) {
    return { to: `/events/${eventRegister.params.eventId}`, label: 'Event' }
  }

  const eventResults = matchPath({ path: '/events/:eventId/results', end: true }, pathname)
  if (eventResults?.params?.eventId) {
    return { to: `/events/${eventResults.params.eventId}`, label: 'Event' }
  }

  const eventProjector = matchPath({ path: '/events/:eventId/projector', end: true }, pathname)
  if (eventProjector?.params?.eventId) {
    return { to: `/events/${eventProjector.params.eventId}/results`, label: 'Results' }
  }

  if (pathname === '/how') return { to: '/', label: 'Home' }
  if (pathname === '/login') return { to: '/', label: 'Home' }

  if (pathname === '/athlete') return { to: '/', label: 'Home' }
  if (pathname === '/athlete/course') return { to: '/athlete', label: 'Dashboard' }
  if (pathname === '/athlete/results') return { to: '/athlete', label: 'Dashboard' }

  const staffCheckin = matchPath({ path: '/staff/checkin/:eventId', end: true }, pathname)
  if (staffCheckin?.params?.eventId) {
    return { to: `/events/${staffCheckin.params.eventId}`, label: 'Event' }
  }

  if (pathname === '/admin') return { to: '/', label: 'Home' }

  return { to: '/', label: 'Home' }
}

export function BackNav() {
  const loc = useLocation()
  const target = getBackTarget(loc.pathname)
  if (!target) return null

  return (
    <div className="mb-4">
      <Link
        to={target.to}
        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900"
        aria-label={`Back to ${target.label}`}
      >
        <span aria-hidden>←</span>
        Back
      </Link>
    </div>
  )
}
