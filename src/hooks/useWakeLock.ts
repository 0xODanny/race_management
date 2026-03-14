import { useEffect, useRef, useState } from 'react'

export function useWakeLock(active: boolean) {
  const lockRef = useRef<any>(null)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported('wakeLock' in navigator)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function request() {
      try {
        if (!('wakeLock' in navigator)) return
        const wl = await (navigator as any).wakeLock.request('screen')
        if (cancelled) {
          await wl.release()
          return
        }
        lockRef.current = wl
      } catch {
        // ignore
      }
    }

    async function release() {
      try {
        await lockRef.current?.release?.()
      } catch {
        // ignore
      } finally {
        lockRef.current = null
      }
    }

    if (active) {
      void request()
    } else {
      void release()
    }

    const onVis = () => {
      if (document.visibilityState === 'visible' && active) void request()
      if (document.visibilityState === 'hidden') void release()
    }

    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void release()
    }
  }, [active])

  return { supported }
}
