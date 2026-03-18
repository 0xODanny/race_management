export const OFFLINE_MAP_CACHE_VERSION = 'v2'

// Cache used for tile responses needed for offline map usage.
export function tilesCacheName() {
  return `rm_offline_tiles_${OFFLINE_MAP_CACHE_VERSION}`
}

// Key used to tag an event/package for storage cleanup.
export function packageTag(eventId: string, packageVersion: string) {
  return `event:${eventId}:pkg:${packageVersion}`
}
