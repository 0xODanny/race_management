// Supabase Edge Function: register-for-event
// Upserts the athlete profile for the authenticated user and inserts a registration row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Body = {
  eventId: string
  fullName: string
  phone: string
  birthdate: string
  sex: string
  categoryId: string | null
  emergencyContact: { name: string; phone: string }
  waiverAccepted: boolean
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
  if (!body?.eventId) return json(400, { error: 'Missing eventId' })
  if (!body.waiverAccepted) return json(400, { error: 'Waiver acceptance required' })

  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Unauthorized' })

  const user = userData.user

  const { data: athlete, error: upErr } = await sb
    .from('athletes')
    .upsert(
      {
        user_id: user.id,
        full_name: body.fullName,
        email: user.email,
        phone: body.phone,
        birthdate: body.birthdate,
        sex: body.sex,
        emergency_contact: body.emergencyContact,
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single()

  if (upErr || !athlete) return json(500, { error: upErr?.message ?? 'Athlete upsert failed' })

  const { error: regErr } = await sb.from('registrations').upsert(
    {
      athlete_id: athlete.id,
      event_id: body.eventId,
      category_id: body.categoryId,
      waiver_signed: true,
      checked_in: false,
      payment_status: 'unpaid',
    },
    { onConflict: 'athlete_id,event_id' },
  )

  if (regErr) return json(500, { error: regErr.message })

  return json(200, { ok: true })
})
