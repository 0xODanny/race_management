export type StorageEstimate = {
  quotaBytes: number | null
  usageBytes: number | null
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  try {
    const est = await navigator.storage?.estimate?.()
    return {
      quotaBytes: typeof est?.quota === 'number' ? est.quota : null,
      usageBytes: typeof est?.usage === 'number' ? est.usage : null,
    }
  } catch {
    return { quotaBytes: null, usageBytes: null }
  }
}
