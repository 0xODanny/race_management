// Supabase Edge Function: race-package
// Returns the offline race package for an authenticated athlete based on bib + event.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Body = {
  eventId: string
  bibId: string
  bibQrRaw?: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
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
  if (!body?.eventId || !body?.bibId) return json(400, { error: 'Missing eventId/bibId' })

  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Unauthorized' })

  const { data: athlete, error: athleteErr } = await sb
    .from('athletes')
    .select('id,full_name,email,phone')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (athleteErr || !athlete) return json(403, { error: 'Athlete profile not found' })

  const { data: assignment, error: asgErr } = await sb
    .from('route_assignments')
    .select('route_id, bib_id, stage_type, events(title), bibs(bib_number), routes(code, strict_order)')
    .eq('event_id', body.eventId)
    .eq('athlete_id', athlete.id)
    .maybeSingle()

  if (asgErr || !assignment) return json(403, { error: 'Route assignment not found for athlete/event' })
  if (assignment.bib_id !== body.bibId) return json(403, { error: 'Bib does not match assignment' })

  const routeId = assignment.route_id as string

  const { data: stages, error: stagesErr } = await sb
    .from('route_stages')
    .select('id, sequence_no, stage_type, stage_code')
    .eq('route_id', routeId)
    .order('sequence_no', { ascending: true })

  if (stagesErr || !stages) return json(500, { error: 'Failed to load route stages' })

  const stageIds = stages.map((s) => s.id)

  const { data: stageCps, error: stageCpsErr } = await sb
    .from('route_stage_checkpoints')
    .select('route_stage_id, sequence_no, checkpoints!inner(id, code, name, kind)')
    .in('route_stage_id', stageIds)
    .order('sequence_no', { ascending: true })

  if (stageCpsErr || !stageCps) return json(500, { error: 'Failed to load stage checkpoints' })

  const checkpointsByStage = new Map<string, any[]>()
  for (const row of stageCps) {
    const arr = checkpointsByStage.get(row.route_stage_id) ?? []
    arr.push(row)
    checkpointsByStage.set(row.route_stage_id, arr)
  }

  const routeStages = stages.map((s) => {
    const cps = (checkpointsByStage.get(s.id) ?? []).sort((a, b) => a.sequence_no - b.sequence_no)
    return {
      stageNo: s.sequence_no,
      stageType: s.stage_type,
      stageCode: s.stage_code,
      checkpoints: cps.map((c) => ({
        checkpointId: c.checkpoints.id,
        code: c.checkpoints.code,
        name: c.checkpoints.name,
        kind: c.checkpoints.kind,
      })),
    }
  })

  const pkg = {
    eventId: body.eventId,
    eventTitle: (assignment.events as any).title,
    stageType: assignment.stage_type,
    athlete: {
      athleteId: athlete.id,
      fullName: athlete.full_name,
      email: athlete.email,
      phone: athlete.phone,
    },
    bib: {
      bibId: assignment.bib_id,
      bibNumber: (assignment.bibs as any).bib_number,
    },
    route: {
      eventId: body.eventId,
      routeId,
      routeCode: (assignment.routes as any).code,
      strictOrder: true,
      stages: routeStages,
    },
    downloadedAt: Date.now(),
  }

  return json(200, pkg)
})
