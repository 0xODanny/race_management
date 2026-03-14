import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured, requireSupabaseEnv } from './env'

let _client: SupabaseClient<any> | null = null

export function getSupabase() {
  if (_client) return _client
  requireSupabaseEnv()
  _client = createClient<any>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })
  return _client
}

export function getSupabaseOrNull() {
  if (!isSupabaseConfigured()) return null
  return getSupabase()
}
