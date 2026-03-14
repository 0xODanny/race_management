export type UserRole = 'athlete' | 'staff' | 'admin'

export function readRoleFromMetadata(userMetadata: unknown): UserRole | null {
  if (!userMetadata || typeof userMetadata !== 'object') return null
  const role = (userMetadata as any).role
  if (role === 'athlete' || role === 'staff' || role === 'admin') return role
  return null
}
