function readEnv(name: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value : ''
}

export const env = {
  supabaseUrl: readEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
  // Base64 (NOT base64url) encoded 32-byte Ed25519 public key.
  qrVerifyPublicKeyB64: readEnv('VITE_QR_VERIFY_PUBLIC_KEY_B64'),

  // Local demo auth for localhost verification (no Supabase required).
  // Enable with: VITE_LOCAL_AUTH=1
  localAuthEnabled: readEnv('VITE_LOCAL_AUTH') === '1',
  // Optional: auto sign-in as local admin on app start.
  localAuthAutoAdmin: readEnv('VITE_LOCAL_AUTH_AUTO_ADMIN') === '1',
}

export function isSupabaseConfigured(): boolean {
  return !!(env.supabaseUrl && env.supabaseAnonKey)
}

export function requireSupabaseEnv() {
  const missing: string[] = []
  if (!env.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!env.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (missing.length) throw new Error(`Missing required Supabase env vars: ${missing.join(', ')}`)
}

export function requireQrVerifyKeyEnv() {
  if (!env.qrVerifyPublicKeyB64) {
    throw new Error('Missing required env var: VITE_QR_VERIFY_PUBLIC_KEY_B64')
  }
}
