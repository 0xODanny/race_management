// Supabase Edge Function: validate-finish
// Server-side route validation to produce OFFICIAL / INCOMPLETE / DSQ results.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Body = {
  localSessionId: string
}

type Stage = {
  stageNo: number
  stageType: 'anchor' | 'block'
  stageCode: string
  checkpoints: { checkpointId: string; code: string; kind: 'start' | 'checkpoint' | 'finish' }[]
}

type RouteDef = { routeId: string; stages: Stage[] }

type Progress = { stageIndex: number; checkpointIndex: number; completed: Set<string> }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function expected(route: RouteDef, progress: Progress) {
  const stage = route.stages[progress.stageIndex]
  if (!stage) return null
  return stage.checkpoints[progress.checkpointIndex] ?? null
}

function apply(route: RouteDef, progress: Progress, scannedCheckpointId: string, scannedKind: 'start' | 'checkpoint' | 'finish') {
  const exp = expected(route, progress)
  if (!exp) {
    return { valid: false, reason: 'Route complete', progress }
  }
  if (progress.completed.has(scannedCheckpointId)) {
    return { valid: false, reason: 'Already scanned', progress }
  }
  if (scannedCheckpointId !== exp.checkpointId) {
    if (scannedKind === 'finish' && exp.kind !== 'finish') {
      return { valid: false, reason: `Finish not valid yet. Expected ${exp.code}.`, progress }
    }
    return { valid: false, reason: `Wrong checkpoint. Expected ${exp.code}.`, progress }
  }

  const next: Progress = {
    stageIndex: progress.stageIndex,
    checkpointIndex: progress.checkpointIndex,
    completed: new Set(progress.completed),
  }
  next.completed.add(scannedCheckpointId)
  const stage = route.stages[progress.stageIndex]!
  next.checkpointIndex++
  if (next.checkpointIndex >= stage.checkpoints.length) {
    next.stageIndex++
    next.checkpointIndex = 0
  }

  return { valid: true, reason: null as string | null, progress: next }
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
  if (!body?.localSessionId) return json(400, { error: 'Missing localSessionId' })

  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Unauthorized' })

  const { data: athlete, error: athleteErr } = await sb
    .from('athletes')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (athleteErr || !athlete) return json(403, { error: 'Athlete profile not found' })

  const { data: session, error: sessErr } = await sb
    .from('race_sessions')
    .select('id,event_id,route_id,status')
    .eq('athlete_id', athlete.id)
    .eq('client_session_id', body.localSessionId)
    .maybeSingle()

  if (sessErr || !session) return json(404, { error: 'Race session not found' })

  // Load route definition.
  const { data: stages, error: stagesErr } = await sb
    .from('route_stages')
    .select('id, sequence_no, stage_type, stage_code')
    .eq('route_id', session.route_id)
    .order('sequence_no', { ascending: true })

  if (stagesErr || !stages) return json(500, { error: 'Failed to load route stages' })

  const stageIds = stages.map((s) => s.id)
  const { data: stageCps, error: stageCpsErr } = await sb
    .from('route_stage_checkpoints')
    .select('route_stage_id, sequence_no, checkpoints!inner(id, code, kind)')
    .in('route_stage_id', stageIds)
    .order('sequence_no', { ascending: true })

  if (stageCpsErr || !stageCps) return json(500, { error: 'Failed to load route stage checkpoints' })

  const cpsByStage = new Map<string, any[]>()
  for (const row of stageCps) {
    const arr = cpsByStage.get(row.route_stage_id) ?? []
    arr.push(row)
    cpsByStage.set(row.route_stage_id, arr)
  }

  const route: RouteDef = {
    routeId: session.route_id,
    stages: stages.map((s) => {
      const cps = (cpsByStage.get(s.id) ?? []).sort((a, b) => a.sequence_no - b.sequence_no)
      return {
        stageNo: s.sequence_no,
        stageType: s.stage_type,
        stageCode: s.stage_code,
        checkpoints: cps.map((c) => ({
          checkpointId: c.checkpoints.id,
          code: c.checkpoints.code,
          kind: c.checkpoints.kind,
        })),
      }
    }),
  }

  // Load scan events.
  const { data: scans, error: scansErr } = await sb
    .from('scan_events')
    .select('checkpoint_id,checkpoint_code,scanned_at_device,qr_type,is_valid')
    .eq('race_session_id', session.id)
    .order('scanned_at_device', { ascending: true })

  if (scansErr) return json(500, { error: scansErr.message })

  // Re-validate deterministically (do not trust client validity).
  let progress: Progress = { stageIndex: 0, checkpointIndex: 0, completed: new Set() }
  let startTime: number | null = null
  let finishTime: number | null = null
  let lastValidCode: string | null = null

  for (const s of scans ?? []) {
    const scannedAt = new Date(s.scanned_at_device).getTime()
    const r = apply(route, progress, s.checkpoint_id, s.qr_type)
    if (r.valid) {
      progress = r.progress
      lastValidCode = s.checkpoint_code
      if (s.qr_type === 'start' && startTime == null) startTime = scannedAt
      if (s.qr_type === 'finish') finishTime = scannedAt
    }
  }

  const routeComplete = progress.stageIndex >= route.stages.length

  let status: 'official' | 'incomplete' | 'dsq' = 'incomplete'
  let officialMs: number | null = null
  let dsqReason: string | null = null

  if (routeComplete && startTime != null && finishTime != null) {
    status = 'official'
    officialMs = finishTime - startTime
  } else {
    status = 'incomplete'
    dsqReason = routeComplete ? null : 'Incomplete route'
  }

  // Rank scope: qualifiers compare within route; finals can be configured via route_assignments.group_code.
  const { data: asg } = await sb
    .from('route_assignments')
    .select('stage_type, group_code')
    .eq('event_id', session.event_id)
    .eq('athlete_id', athlete.id)
    .maybeSingle()

  const rankScope = asg?.stage_type === 'qualifier'
    ? `qualifier:${session.route_id}`
    : `final:${asg?.group_code ?? 'all'}`

  await sb.from('results').upsert(
    {
      race_session_id: session.id,
      event_id: session.event_id,
      athlete_id: athlete.id,
      status,
      official_time_ms: officialMs,
      dsq_reason: status === 'dsq' ? dsqReason : null,
      last_checkpoint_code: lastValidCode,
      rank_scope: rankScope,
    },
    { onConflict: 'race_session_id' },
  )

  // Compute ranks for this scope.
  await sb.rpc('recompute_ranks', { p_event_id: session.event_id, p_rank_scope: rankScope })

  return json(200, { ok: true, status, officialTimeMs: officialMs })
})
