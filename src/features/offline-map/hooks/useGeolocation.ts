import { useEffect, useMemo, useRef, useState } from 'react'
import type { OfflineGpsFix } from '../types'
import { getOfflineRaceProgress, upsertOfflineRaceProgress } from '../storage/offlineMapRepo'

export type GeolocationStatus = 'idle' | 'searching' | 'active' | 'denied' | 'unavailable' | 'timeout'

export type GeolocationState = {
  status: GeolocationStatus
  fix: OfflineGpsFix | null
  stale: boolean
  errorMessage: string | null
}

export function useGeolocation(params: {
  eventId: string
  enabled: boolean
  highAccuracy?: boolean
  staleAfterMs?: number
}) {
  const { eventId, enabled, highAccuracy = true, staleAfterMs = 15_000 } = params

  const [nowMs, setNowMs] = useState(0)

  const [state, setState] = useState<GeolocationState>({
    status: enabled ? 'searching' : 'idle',
    fix: null,
    stale: false,
    errorMessage: null,
  })

  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [enabled])

  const stale = useMemo(() => {
    if (!enabled) return false
    if (!state.fix) return true
    if (!nowMs) return true
    return nowMs - state.fix.timestamp > staleAfterMs
  }, [enabled, state.fix, staleAfterMs, nowMs])

  useEffect(() => {
    let cancelled = false

    async function bootstrapLastKnown() {
      const p = await getOfflineRaceProgress(eventId)
      if (cancelled) return
      if (p?.lastKnownFix) {
        setState((s) => ({ ...s, fix: p.lastKnownFix!, status: enabled ? s.status : 'idle' }))
      }
    }

    void bootstrapLastKnown()

    return () => {
      cancelled = true
    }
  }, [eventId, enabled])

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setState((s) => ({ ...s, status: 'idle' }))
      return
    }

    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unavailable', errorMessage: 'Geolocation not supported' }))
      return
    }

    setState((s) => ({ ...s, status: 'searching', errorMessage: null }))

    const options: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      maximumAge: 2_000,
      timeout: 10_000,
    }

    const onSuccess = async (pos: GeolocationPosition) => {
      const fix: OfflineGpsFix = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyMeters: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
        headingDeg: typeof pos.coords.heading === 'number' ? pos.coords.heading : undefined,
        speedMps: typeof pos.coords.speed === 'number' ? pos.coords.speed : undefined,
        timestamp: pos.timestamp || Date.now(),
      }

      setState({ status: 'active', fix, stale: false, errorMessage: null })

      // Persist last-known fix so the map can still show something when GPS is temporarily unavailable.
      const now = Date.now()
      const prev = await getOfflineRaceProgress(eventId)
      await upsertOfflineRaceProgress({
        key: `event:${eventId}`,
        eventId,
        lastKnownFix: fix,
        lastSyncAt: prev?.lastSyncAt,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      })
    }

    const onError = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) {
        setState((s) => ({ ...s, status: 'denied', errorMessage: e.message || 'Permission denied' }))
        return
      }
      if (e.code === e.TIMEOUT) {
        setState((s) => ({ ...s, status: 'timeout', errorMessage: e.message || 'Timeout' }))
        return
      }
      setState((s) => ({ ...s, status: 'unavailable', errorMessage: e.message || 'Position unavailable' }))
    }

    // watchPosition keeps running; store id for cleanup.
    const id = navigator.geolocation.watchPosition(onSuccess, onError, options)
    watchIdRef.current = id

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled, eventId, highAccuracy])

  return { ...state, stale }
}
