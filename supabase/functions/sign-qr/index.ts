// Supabase Edge Function: sign-qr
// Admin-only: signs QR payloads with an Ed25519 private key and returns an RM1 token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nacl from 'https://esm.sh/tweetnacl@1.0.3'

type Body = {
  t: 'bib' | 'start' | 'checkpoint' | 'finish'
  eventId: string
  bibId?: string
  checkpointId?: string
  nonce?: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'Missing Authorization header' })

  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Unauthorized' })

  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') return json(403, { error: 'Admin only' })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.t || !body?.eventId) return json(400, { error: 'Missing payload fields' })

  const seedB64 = Deno.env.get('QR_SIGNING_PRIVATE_KEY_B64')
  if (!seedB64) return json(500, { error: 'Missing QR signing key' })

  const seed = b64ToBytes(seedB64)
  const kp = seed.length === 32 ? nacl.sign.keyPair.fromSeed(seed) : seed.length === 64 ? { secretKey: seed, publicKey: seed.slice(32) } : null
  if (!kp) return json(500, { error: 'Bad QR signing key length (need 32-byte seed or 64-byte secretKey)' })

  const payload = {
    v: 1,
    t: body.t,
    eventId: body.eventId,
    issuedAt: Date.now(),
    nonce: body.nonce ?? crypto.randomUUID(),
    bibId: body.bibId,
    checkpointId: body.checkpointId,
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = nacl.sign.detached(payloadBytes, (kp as any).secretKey)

  const token = `RM1.${bytesToB64Url(payloadBytes)}.${bytesToB64Url(sig)}`
  return json(200, { ok: true, token, payload })
})
