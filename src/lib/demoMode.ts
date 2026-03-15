const KEY_TEST = 'rm_test_mode_v1'
const KEY_TRIAL = 'rm_trial_mode_v1'

function safeGet(key: string): string {
  try {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function safeSet(key: string, value: string) {
  try {
    if (typeof window === 'undefined') return
    if (!value) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export function isTestModeEnabled(): boolean {
  return safeGet(KEY_TEST) === '1'
}

export function isTrialModeEnabled(): boolean {
  return safeGet(KEY_TRIAL) === '1'
}

export function setTestModeEnabled(enabled: boolean) {
  safeSet(KEY_TEST, enabled ? '1' : '')
}

export function setTrialModeEnabled(enabled: boolean) {
  safeSet(KEY_TRIAL, enabled ? '1' : '')
  // Trial mode implies test/unlocked mode.
  if (enabled) safeSet(KEY_TEST, '1')
}

export function reloadApp() {
  if (typeof window === 'undefined') return
  window.location.reload()
}
