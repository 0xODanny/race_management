function readEnv(name: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value : ''
}

export const env = {
  supabaseUrl: readEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
  // Base64 (NOT base64url) encoded 32-byte Ed25519 public key.
  qrVerifyPublicKeyB64: readEnv('VITE_QR_VERIFY_PUBLIC_KEY_B64'),
}

export function requireEnv() {
  const missing: string[] = []
  if (!env.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!env.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (!env.qrVerifyPublicKeyB64) missing.push('VITE_QR_VERIFY_PUBLIC_KEY_B64')
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}
