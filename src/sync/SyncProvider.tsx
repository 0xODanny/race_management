import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { syncNow } from './sync'

type SyncState = {
  syncing: boolean
  lastSyncAt: number | null
  lastError: string | null
  triggerSync: () => Promise<void>
}

const SyncContext = createContext<SyncState>({
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  triggerSync: async () => {},
})

export function SyncProvider(props: { children: React.ReactNode }) {
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  async function triggerSync() {
    if (syncing) return
    setSyncing(true)
    setLastError(null)
    try {
      await syncNow({ maxItems: 50 })
      setLastSyncAt(Date.now())
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'Sync error')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const onOnline = () => {
      void triggerSync()
    }
    window.addEventListener('online', onOnline)

    const interval = window.setInterval(() => {
      void triggerSync()
    }, 15_000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [])

  const value = useMemo(
    () => ({ syncing, lastSyncAt, lastError, triggerSync }),
    [syncing, lastSyncAt, lastError],
  )

  return <SyncContext.Provider value={value}>{props.children}</SyncContext.Provider>
}

export function useSync() {
  return useContext(SyncContext)
}
