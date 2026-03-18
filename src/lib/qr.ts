import nacl from 'tweetnacl'
import { base64ToBytes, base64UrlToBytes, bytesToUtf8 } from './base64url'
import { env } from './env'

export type QrTokenType = 'bib' | 'start' | 'checkpoint' | 'finish'

export type SignedQrPayloadV1 = {
  v: 1
  t: QrTokenType
  eventId: string
  issuedAt: number
  nonce: string
  bibId?: string
  checkpointId?: string
}

export type DecodedSignedQr =
  | {
      ok: true
      raw: string
      payload: SignedQrPayloadV1
    }
  | {
      ok: false
      raw: string
      error: string
    }

// Format: RM1.<payloadBase64Url(JSON) >.<sigBase64Url(Ed25519)>
const PREFIX = 'RM1'
// Unsigned payload for local demo: RMU.<payloadBase64Url(JSON)>
const UNSIGNED_PREFIX = 'RMU'
// Human-friendly local demo format:
//   RMDEMO:<t>:<eventId>:<id>
// where <t> is bib|start|checkpoint|finish and <id> is bibId (for bib) or checkpointId.
const DEMO_PREFIX = 'RMDEMO'

function validatePayload(payload: SignedQrPayloadV1): { ok: true } | { ok: false; error: string } {
  if (payload?.v !== 1) return { ok: false, error: 'Unsupported QR version' }
  if (!payload?.t || !payload?.eventId) return { ok: false, error: 'Malformed QR payload' }
  if (payload.t === 'bib' && !payload.bibId) return { ok: false, error: 'Bib QR missing bibId' }
  if (payload.t !== 'bib' && !payload.checkpointId) return { ok: false, error: 'Checkpoint QR missing checkpointId' }
  return { ok: true }
}

function parseUnsignedPayloadFromB64Url(payloadB64Url: string): SignedQrPayloadV1 {
  const payloadBytes = base64UrlToBytes(payloadB64Url)
  const json = bytesToUtf8(payloadBytes)
  return JSON.parse(json) as SignedQrPayloadV1
}

function tryParseDemoQr(trimmed: string): SignedQrPayloadV1 | null {
  const demo = `${DEMO_PREFIX}:`
  if (!trimmed.startsWith(demo)) return null
  const parts = trimmed.split(':')
  // RMDEMO:t:eventId:id
  if (parts.length !== 4) return null
  const t = parts[1] as QrTokenType
  const eventId = parts[2]
  const id = parts[3]
  if (!eventId || !id) return null
  if (t !== 'bib' && t !== 'start' && t !== 'checkpoint' && t !== 'finish') return null

  const base: SignedQrPayloadV1 = {
    v: 1,
    t,
    eventId,
    issuedAt: Date.now(),
    nonce: `demo_${Date.now()}`,
  }

  if (t === 'bib') return { ...base, bibId: id }
  return { ...base, checkpointId: id }
}

export function decodeAndVerifySignedQr(raw: string): DecodedSignedQr {
  try {
    const trimmed = raw.trim()
    const parts = trimmed.split('.')
    const allowUnverified = env.localAuthEnabled || env.qrAllowUnverified || import.meta.env.DEV

    if (parts.length === 3 && parts[0] === PREFIX) {
      // Signed format.
      const payloadB64Url = parts[1]
      const sigB64Url = parts[2]

      // Local/demo fallback: accept the signed container but skip signature verification.
      if (!env.qrVerifyPublicKeyB64) {
        if (!allowUnverified) return { ok: false, raw, error: 'Missing required env var: VITE_QR_VERIFY_PUBLIC_KEY_B64' }
        const payload = parseUnsignedPayloadFromB64Url(payloadB64Url)
        const v = validatePayload(payload)
        if (!v.ok) return { ok: false, raw, error: v.error }
        return { ok: true, raw, payload }
      }

      const payloadBytes = base64UrlToBytes(payloadB64Url)
      const sigBytes = base64UrlToBytes(sigB64Url)

      const pubKey = base64ToBytes(env.qrVerifyPublicKeyB64)
      const ok = nacl.sign.detached.verify(payloadBytes, sigBytes, pubKey)
      if (!ok) return { ok: false, raw, error: 'Invalid QR signature' }

      const json = bytesToUtf8(payloadBytes)
      const payload = JSON.parse(json) as SignedQrPayloadV1
      const v = validatePayload(payload)
      if (!v.ok) return { ok: false, raw, error: v.error }

      return { ok: true, raw, payload }
    }

    if (allowUnverified) {
      // Unsigned base64url JSON.
      if (parts.length === 2 && parts[0] === UNSIGNED_PREFIX) {
        const payload = parseUnsignedPayloadFromB64Url(parts[1])
        const v = validatePayload(payload)
        if (!v.ok) return { ok: false, raw, error: v.error }
        return { ok: true, raw, payload }
      }

      // Human-friendly RMDEMO:...
      const demo = tryParseDemoQr(trimmed)
      if (demo) {
        const v = validatePayload(demo)
        if (!v.ok) return { ok: false, raw, error: v.error }
        return { ok: true, raw, payload: demo }
      }
    }

    return { ok: false, raw, error: 'Unrecognized QR format' }
  } catch (e) {
    return { ok: false, raw, error: e instanceof Error ? e.message : 'QR parse error' }
  }
}
