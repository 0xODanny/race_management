import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Keep MVP minimal: reload on update.
      // In production you may want a custom "Update available" banner.
      window.location.reload()
    },
    onOfflineReady() {
      // no-op
    },
  })
}
