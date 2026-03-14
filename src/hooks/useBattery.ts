import { useEffect, useState } from 'react'

type BatteryState = {
  supported: boolean
  level: number | null // 0..1
  charging: boolean | null
}

export function useBattery(): BatteryState {
  const [state, setState] = useState<BatteryState>({ supported: false, level: null, charging: null })

  useEffect(() => {
    let battery: any
    let update: (() => void) | null = null
    let cancelled = false

    async function init() {
      try {
        const getBattery = (navigator as any).getBattery
        if (!getBattery) {
          setState({ supported: false, level: null, charging: null })
          return
        }
        battery = await getBattery.call(navigator)
        if (cancelled) return

        update = () => {
          setState({
            supported: true,
            level: typeof battery.level === 'number' ? battery.level : null,
            charging: typeof battery.charging === 'boolean' ? battery.charging : null,
          })
        }

        update()
        battery.addEventListener?.('levelchange', update)
        battery.addEventListener?.('chargingchange', update)

        return () => {
          battery.removeEventListener?.('levelchange', update)
          battery.removeEventListener?.('chargingchange', update)
        }
      } catch {
        setState({ supported: false, level: null, charging: null })
      }
    }

    void init()

    return () => {
      cancelled = true
      try {
        if (battery && update) {
          battery.removeEventListener?.('levelchange', update)
          battery.removeEventListener?.('chargingchange', update)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  return state
}
