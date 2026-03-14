import nacl from 'tweetnacl'
import { base64ToBytes, base64UrlToBytes, bytesToUtf8 } from './base64url'
import { env, requireQrVerifyKeyEnv } from './env'

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

export function decodeAndVerifySignedQr(raw: string): DecodedSignedQr {
  try {
    requireQrVerifyKeyEnv()
    const trimmed = raw.trim()
    const parts = trimmed.split('.')
    if (parts.length !== 3 || parts[0] !== PREFIX) {
      return { ok: false, raw, error: 'Unrecognized QR format' }
    }

    const payloadBytes = base64UrlToBytes(parts[1])
    const sigBytes = base64UrlToBytes(parts[2])

    const pubKey = base64ToBytes(env.qrVerifyPublicKeyB64)
    const ok = nacl.sign.detached.verify(payloadBytes, sigBytes, pubKey)
    if (!ok) return { ok: false, raw, error: 'Invalid QR signature' }

    const json = bytesToUtf8(payloadBytes)
    const payload = JSON.parse(json) as SignedQrPayloadV1
    if (payload?.v !== 1) return { ok: false, raw, error: 'Unsupported QR version' }
    if (!payload?.t || !payload?.eventId) return { ok: false, raw, error: 'Malformed QR payload' }

    return { ok: true, raw, payload }
  } catch (e) {
    return { ok: false, raw, error: e instanceof Error ? e.message : 'QR parse error' }
  }
}
