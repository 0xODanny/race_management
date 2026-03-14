// Supabase Edge Function: ingest-scan
// Inserts a scan event, upserts the race session, and maintains a provisional results row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Body = {
  localScanId: string
  localSessionId: string
  eventId: string
  checkpointId: string
  checkpointCode: string
  scannedAtDevice: number
  qrRaw: string
  qrType: 'start' | 'checkpoint' | 'finish'
  isValid: boolean
  validationReason: string | null
  expectedNextCheckpointId: string | null
  stageNo: number | null
  createdAt: number
  deviceId: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
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

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.eventId || !body?.checkpointId || !body?.localScanId || !body?.deviceId || !body?.localSessionId) {
    return json(400, { error: 'Missing required fields' })
  }

  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Unauthorized' })

  const { data: athlete, error: athleteErr } = await sb
    .from('athletes')
    .select('id,full_name')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (athleteErr || !athlete) return json(403, { error: 'Athlete profile not found' })

  const { data: asg, error: asgErr } = await sb
    .from('route_assignments')
    .select('bib_id, route_id, bibs(bib_number)')
    .eq('event_id', body.eventId)
    .eq('athlete_id', athlete.id)
    .maybeSingle()
  if (asgErr || !asg) return json(403, { error: 'Route assignment not found' })

  // Upsert/ensure a race session for this athlete+event+device.
  const { data: existingSession } = await sb
    .from('race_sessions')
    .select('id, status, started_at, finished_at')
    .eq('event_id', body.eventId)
    .eq('athlete_id', athlete.id)
    .eq('device_id', body.deviceId)
    .maybeSingle()

  let sessionId = existingSession?.id as string | undefined

  if (!sessionId) {
    const { data: ins, error: insErr } = await sb
      .from('race_sessions')
      .insert({
        event_id: body.eventId,
        athlete_id: athlete.id,
        bib_id: asg.bib_id,
        route_id: asg.route_id,
        device_id: body.deviceId,
        client_session_id: body.localSessionId,
        status: 'not_started',
      })
      .select('id, status, started_at, finished_at')
      .single()

    if (insErr || !ins) return json(500, { error: 'Failed to create race session' })
    sessionId = ins.id
  } else {
    // Keep client_session_id updated (best-effort).
    await sb
      .from('race_sessions')
      .update({ client_session_id: body.localSessionId })
      .eq('id', sessionId)
  }

  // Insert scan event (idempotent per session + client_scan_id).
  const scannedAtIso = new Date(body.scannedAtDevice).toISOString()

  const { error: scanErr } = await sb.from('scan_events').insert({
    race_session_id: sessionId,
    checkpoint_id: body.checkpointId,
    checkpoint_code: body.checkpointCode,
    scanned_at_device: scannedAtIso,
    qr_type: body.qrType,
    qr_raw: body.qrRaw,
    is_valid: body.isValid,
    validation_reason: body.validationReason,
    expected_next_checkpoint_id: body.expectedNextCheckpointId,
    stage_no: body.stageNo,
    client_scan_id: body.localScanId,
  })

  if (scanErr) {
    // Unique constraint = already ingested.
    if (!scanErr.message.toLowerCase().includes('duplicate')) {
      return json(500, { error: scanErr.message })
    }
  }

  // Update session + results (provisional layer).
  const startedAt = existingSession?.started_at ? new Date(existingSession.started_at).getTime() : null

  let nextStatus = existingSession?.status ?? 'not_started'
  let nextStartedAtIso: string | null = existingSession?.started_at ?? null
  let nextFinishedAtIso: string | null = existingSession?.finished_at ?? null

  if (body.isValid && body.qrType === 'start' && !nextStartedAtIso) {
    nextStartedAtIso = scannedAtIso
    nextStatus = 'racing'
  }

  if (body.isValid && body.qrType === 'finish') {
    nextFinishedAtIso = scannedAtIso
    nextStatus = 'finished_validating'
  }

  await sb
    .from('race_sessions')
    .update({ status: nextStatus, started_at: nextStartedAtIso, finished_at: nextFinishedAtIso })
    .eq('id', sessionId)

  let provisionalMs: number | null = null
  if (nextStartedAtIso && nextFinishedAtIso) {
    provisionalMs = new Date(nextFinishedAtIso).getTime() - new Date(nextStartedAtIso).getTime()
  } else if (startedAt && body.isValid && body.qrType === 'finish') {
    provisionalMs = body.scannedAtDevice - startedAt
  }

  const bibNumber = (asg.bibs as any)?.bib_number ?? null

  await sb.from('results').upsert(
    {
      race_session_id: sessionId,
      event_id: body.eventId,
      athlete_id: athlete.id,
      bib_number: bibNumber,
      status: nextStatus,
      provisional_time_ms: provisionalMs,
      last_checkpoint_code: body.isValid ? body.checkpointCode : undefined,
    },
    { onConflict: 'race_session_id' },
  )

  return json(200, { ok: true })
})
