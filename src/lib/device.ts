import { nanoid } from 'nanoid'

const DEVICE_ID_KEY = 'rm_device_id_v1'

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const id = `dev_${nanoid(12)}`
  localStorage.setItem(DEVICE_ID_KEY, id)
  return id
}
