export type DemoEvent = {
  id: string
  title: string
  title_pt?: string
  description: string
  description_pt?: string
  location: string
  start_date: string
  status: 'scheduled' | 'live' | 'completed'
}

export type DemoResultRow = {
  id: string
  event_id: string
  status: 'provisional' | 'official' | 'incomplete'
  official_time_ms: number | null
  provisional_time_ms: number | null
  rank: number | null
  rank_scope: string | null
  updated_at: string
  athlete_name: string
  bib_number: string
  last_checkpoint_code: string | null
}

export type DemoCheckInRow = {
  registration_id: string
  event_id: string
  athlete_id: string
  full_name: string
  email: string
  phone: string
  checked_in: boolean
  bib_number: string
}

const today = new Date()

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const d0 = new Date(today)
const d1 = new Date(today)
const d2 = new Date(today)

// Spread across time so it looks realistic.
// (All demo data; no external calls.)
// Brazil locations.

d0.setDate(today.getDate() + 7)

d1.setDate(today.getDate() - 1)

d2.setDate(today.getDate() + 28)

export const demoEvents: DemoEvent[] = [
  {
    id: 'demo-bra-florianopolis-10k',
    title: 'Floripa Coastal 10K (Demo)',
    title_pt: 'Floripa Coastal 10K (Demo)',
    description:
      'A fast coastal course along the waterfront. Demo event used to preview app layouts and live results.',
    description_pt:
      'Um percurso rápido e costeiro ao longo da orla. Evento demo para visualizar layouts do app e resultados ao vivo.',
    location: 'Florianópolis, Santa Catarina, Brazil',
    start_date: isoDate(d0),
    status: 'scheduled',
  },
  {
    id: 'demo-bra-serra-trail-21k',
    title: 'Serra do Mar Trail 21K (Demo)',
    title_pt: 'Serra do Mar Trail 21K (Demo)',
    description:
      'Technical forest trail with strict checkpoint order. Demo event includes participants, check-in, and sample results.',
    description_pt:
      'Trilha técnica em mata com ordem estrita de Checkpoints. Evento demo inclui participantes, check-in e resultados de exemplo.',
    location: 'Curitiba, Paraná, Brazil',
    start_date: isoDate(d1),
    status: 'live',
  },
  {
    id: 'demo-bra-chapada-ultra-55k',
    title: 'Chapada Ultra 55K (Demo)',
    title_pt: 'Chapada Ultra 55K (Demo)',
    description:
      'Highland ultra with multiple anchor checkpoints. Demo event shows leaderboard and projector board layouts.',
    description_pt:
      'Ultra em altitude com múltiplos anchors. Evento demo mostra o leaderboard e o painel (projetor).',
    location: 'Chapada dos Veadeiros, Goiás, Brazil',
    start_date: isoDate(d2),
    status: 'scheduled',
  },
]

export function getDemoEventText(event: DemoEvent, lang: 'en' | 'pt-BR') {
  if (lang === 'pt-BR') {
    return {
      title: event.title_pt ?? event.title,
      description: event.description_pt ?? event.description,
    }
  }
  return { title: event.title, description: event.description }
}

export function getDemoEvent(eventId: string): DemoEvent | null {
  return demoEvents.find((e) => e.id === eventId) ?? null
}

export function getDemoResults(eventId: string): DemoResultRow[] {
  const nowIso = new Date().toISOString()

  if (eventId === 'demo-bra-serra-trail-21k') {
    return [
      {
        id: 'r1',
        event_id: eventId,
        status: 'official',
        official_time_ms: 1 * 3600_000 + 34 * 60_000 + 12_000,
        provisional_time_ms: 1 * 3600_000 + 34 * 60_000 + 15_000,
        rank: 1,
        rank_scope: 'overall',
        updated_at: nowIso,
        athlete_name: 'Camila Rocha',
        bib_number: '101',
        last_checkpoint_code: 'FIN',
      },
      {
        id: 'r2',
        event_id: eventId,
        status: 'provisional',
        official_time_ms: null,
        provisional_time_ms: 1 * 3600_000 + 37 * 60_000 + 44_000,
        rank: 2,
        rank_scope: 'overall',
        updated_at: nowIso,
        athlete_name: 'Rafael Silva',
        bib_number: '118',
        last_checkpoint_code: 'CP4',
      },
      {
        id: 'r3',
        event_id: eventId,
        status: 'provisional',
        official_time_ms: null,
        provisional_time_ms: 1 * 3600_000 + 42 * 60_000 + 3_000,
        rank: 3,
        rank_scope: 'overall',
        updated_at: nowIso,
        athlete_name: 'Daniela Souza',
        bib_number: '133',
        last_checkpoint_code: 'CP3',
      },
      {
        id: 'r4',
        event_id: eventId,
        status: 'incomplete',
        official_time_ms: null,
        provisional_time_ms: null,
        rank: null,
        rank_scope: 'overall',
        updated_at: nowIso,
        athlete_name: 'João Pereira',
        bib_number: '140',
        last_checkpoint_code: 'CP2',
      },
    ]
  }

  // For other demo events keep an empty leaderboard.
  return []
}

const CHECKIN_STATE_KEY = 'rm_trial_checkin_v1'

function loadCheckInState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(CHECKIN_STATE_KEY)
    if (!raw) return {}
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return {}
    return v as Record<string, boolean>
  } catch {
    return {}
  }
}

function saveCheckInState(v: Record<string, boolean>) {
  try {
    window.localStorage.setItem(CHECKIN_STATE_KEY, JSON.stringify(v))
  } catch {
    // ignore
  }
}

export function getDemoCheckInRows(eventId: string): DemoCheckInRow[] {
  const s = typeof window === 'undefined' ? {} : loadCheckInState()
  if (eventId !== 'demo-bra-serra-trail-21k') return []

  const base: Omit<DemoCheckInRow, 'checked_in'>[] = [
    {
      registration_id: 'reg1',
      event_id: eventId,
      athlete_id: 'a1',
      full_name: 'Camila Rocha',
      email: 'camila@example.com',
      phone: '+55 48 99999-1001',
      bib_number: '101',
    },
    {
      registration_id: 'reg2',
      event_id: eventId,
      athlete_id: 'a2',
      full_name: 'Rafael Silva',
      email: 'rafael@example.com',
      phone: '+55 41 98888-1018',
      bib_number: '118',
    },
    {
      registration_id: 'reg3',
      event_id: eventId,
      athlete_id: 'a3',
      full_name: 'Daniela Souza',
      email: 'daniela@example.com',
      phone: '+55 41 97777-1033',
      bib_number: '133',
    },
    {
      registration_id: 'reg4',
      event_id: eventId,
      athlete_id: 'a4',
      full_name: 'João Pereira',
      email: 'joao@example.com',
      phone: '+55 41 96666-1040',
      bib_number: '140',
    },
  ]

  return base.map((r) => ({ ...r, checked_in: !!s[r.registration_id] }))
}

export function toggleDemoCheckIn(registrationId: string): boolean {
  const s = loadCheckInState()
  const next = !s[registrationId]
  s[registrationId] = next
  saveCheckInState(s)
  return next
}
