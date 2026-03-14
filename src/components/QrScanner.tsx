import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export function QrScanner(props: {
  active: boolean
  onScan: (decodedText: string) => void
  onError?: (message: string) => void
}) {
  const regionIdRef = useRef<string>(`qr_${Math.random().toString(16).slice(2)}`)
  const qrRef = useRef<Html5Qrcode | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!props.active) return

    let stopped = false
    const qr = new Html5Qrcode(regionIdRef.current)
    qrRef.current = qr

    async function start() {
      try {
        setReady(false)
        await qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            if (stopped) return
            props.onScan(decodedText)
          },
          (err) => {
            // html5-qrcode is chatty; only surface meaningful errors.
            if (typeof err === 'string' && err.includes('NotFoundException')) return
            props.onError?.(typeof err === 'string' ? err : 'Scan error')
          },
        )
        setReady(true)
      } catch (e) {
        props.onError?.(e instanceof Error ? e.message : 'Camera start failed')
      }
    }

    void start()

    return () => {
      stopped = true
      setReady(false)
      qr
        .stop()
        .catch(() => {})
        .finally(() => {
          try {
            qr.clear()
          } catch {
            // best-effort
          }
        })
    }
  }, [props.active])

  return (
    <div className="w-full">
      <div className="rounded-md bg-black p-2">
        <div id={regionIdRef.current} className="aspect-square w-full overflow-hidden rounded-md bg-black" />
      </div>
      <div className="mt-2 text-center text-xs text-zinc-200">{ready ? 'Scanning…' : 'Starting camera…'}</div>
    </div>
  )
}
