export function vibrateOk() {
  try {
    navigator.vibrate?.([40, 30, 40])
  } catch {
    // ignore
  }
}

export function vibrateError() {
  try {
    navigator.vibrate?.([120])
  } catch {
    // ignore
  }
}

export async function beepOk() {
  await beep(880, 90)
}

export async function beepError() {
  await beep(220, 120)
}

async function beep(freqHz: number, durationMs: number) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freqHz
    gain.gain.value = 0.05
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    await new Promise((r) => setTimeout(r, durationMs))
    osc.stop()
    await ctx.close()
  } catch {
    // ignore
  }
}
