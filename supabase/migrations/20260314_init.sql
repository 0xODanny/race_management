-- MVP schema for offline-first race timing + anti-cheat route enforcement

create extension if not exists "pgcrypto";

-- ---------- helpers ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'athlete' check (role in ('athlete','staff','admin')),
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('staff','admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.recompute_ranks(p_event_id uuid, p_rank_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select
      id,
      row_number() over (order by official_time_ms asc) as rn
    from public.results
    where event_id = p_event_id
      and rank_scope = p_rank_scope
      and status = 'official'
      and official_time_ms is not null
  )
  update public.results r
  set rank = ranked.rn
  from ranked
  where r.id = ranked.id;
end;
$$;

grant execute on function public.recompute_ranks(uuid, text) to authenticated;

-- ---------- core tables ----------
create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  birthdate date,
  sex text,
  emergency_contact jsonb,
  team text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger athletes_updated_at
before update on public.athletes
for each row execute function public.touch_updated_at();

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  start_date date not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','in_progress','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger events_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  sex text,
  age_band text,
  created_at timestamptz not null default now()
);

create index if not exists categories_event_idx on public.categories(event_id);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','comp','refunded')),
  waiver_signed boolean not null default false,
  checked_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, event_id)
);

create trigger registrations_updated_at
before update on public.registrations
for each row execute function public.touch_updated_at();

create index if not exists registrations_event_idx on public.registrations(event_id);

create table if not exists public.bibs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  bib_number text not null,
  athlete_id uuid references public.athletes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, bib_number)
);

create index if not exists bibs_event_idx on public.bibs(event_id);

create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text,
  kind text not null check (kind in ('start','checkpoint','finish')),
  created_at timestamptz not null default now(),
  unique (event_id, code)
);

create index if not exists checkpoints_event_idx on public.checkpoints(event_id);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  strict_order boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, code)
);

create index if not exists routes_event_idx on public.routes(event_id);

create table if not exists public.route_stages (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  sequence_no int not null,
  stage_type text not null check (stage_type in ('anchor','block')),
  stage_code text not null,
  created_at timestamptz not null default now(),
  unique(route_id, sequence_no)
);

create index if not exists route_stages_route_idx on public.route_stages(route_id);

create table if not exists public.route_stage_checkpoints (
  id uuid primary key default gen_random_uuid(),
  route_stage_id uuid not null references public.route_stages(id) on delete cascade,
  sequence_no int not null,
  checkpoint_id uuid not null references public.checkpoints(id) on delete cascade,
  unique(route_stage_id, sequence_no)
);

create index if not exists rsc_stage_idx on public.route_stage_checkpoints(route_stage_id);

-- Route variant / group assignment per athlete for an event day.
create table if not exists public.route_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  bib_id uuid not null references public.bibs(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  stage_type text not null check (stage_type in ('qualifier','final')),
  group_code text,
  created_at timestamptz not null default now(),
  unique(event_id, athlete_id)
);

create index if not exists route_assignments_event_idx on public.route_assignments(event_id);
create index if not exists route_assignments_route_idx on public.route_assignments(route_id);

create table if not exists public.race_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  bib_id uuid not null references public.bibs(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  device_id text not null,
  client_session_id text,
  status text not null default 'not_started' check (status in ('not_started','racing','finished_validating','official','incomplete','dsq')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, athlete_id, device_id)
);

create trigger race_sessions_updated_at
before update on public.race_sessions
for each row execute function public.touch_updated_at();

create index if not exists race_sessions_event_idx on public.race_sessions(event_id);
create index if not exists race_sessions_status_idx on public.race_sessions(status);

create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  race_session_id uuid not null references public.race_sessions(id) on delete cascade,
  checkpoint_id uuid not null references public.checkpoints(id) on delete restrict,
  checkpoint_code text not null,
  scanned_at_device timestamptz not null,
  received_at_server timestamptz not null default now(),
  qr_type text not null check (qr_type in ('start','checkpoint','finish')),
  qr_raw text,
  is_valid boolean not null,
  validation_reason text,
  expected_next_checkpoint_id uuid,
  stage_no int,
  client_scan_id text,
  created_at timestamptz not null default now(),
  unique (race_session_id, client_scan_id)
);

create index if not exists scan_events_session_idx on public.scan_events(race_session_id);
create index if not exists scan_events_received_idx on public.scan_events(received_at_server);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  race_session_id uuid not null unique references public.race_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  bib_number text,
  status text not null default 'not_started' check (status in ('not_started','racing','finished_validating','official','incomplete','dsq')),
  provisional_time_ms bigint,
  official_time_ms bigint,
  rank int,
  rank_scope text,
  last_checkpoint_code text,
  dsq_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger results_updated_at
before update on public.results
for each row execute function public.touch_updated_at();

create index if not exists results_event_idx on public.results(event_id);

-- ---------- views ----------
create or replace view public.staff_checkin_view as
select
  r.event_id,
  r.id as registration_id,
  a.id as athlete_id,
  a.full_name,
  a.email,
  a.phone,
  r.checked_in,
  b.bib_number
from public.registrations r
join public.athletes a on a.id = r.athlete_id
left join public.route_assignments ra on ra.event_id = r.event_id and ra.athlete_id = r.athlete_id
left join public.bibs b on b.id = ra.bib_id;

create or replace view public.results_public as
select
  res.id,
  res.event_id,
  res.race_session_id,
  res.status,
  res.official_time_ms,
  res.provisional_time_ms,
  res.rank,
  res.rank_scope,
  res.updated_at,
  a.full_name as athlete_name,
  res.bib_number,
  res.last_checkpoint_code
from public.results res
join public.athletes a on a.id = res.athlete_id;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.registrations enable row level security;
alter table public.route_assignments enable row level security;
alter table public.race_sessions enable row level security;
alter table public.scan_events enable row level security;
alter table public.results enable row level security;

-- profiles
create policy "profiles_select_own" on public.profiles
for select using (user_id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update using (user_id = auth.uid());

create policy "profiles_admin_all" on public.profiles
for all using (public.is_admin());

-- athletes
create policy "athletes_select_own" on public.athletes
for select using (user_id = auth.uid() or public.is_staff_or_admin());

create policy "athletes_upsert_own" on public.athletes
for insert with check (user_id = auth.uid());

create policy "athletes_update_own" on public.athletes
for update using (user_id = auth.uid() or public.is_staff_or_admin());

-- registrations
create policy "registrations_select" on public.registrations
for select using (
  public.is_staff_or_admin() or
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "registrations_insert_own" on public.registrations
for insert with check (
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "registrations_update_staff" on public.registrations
for update using (public.is_staff_or_admin());

-- route assignments (staff/admin managed)
create policy "route_assignments_select" on public.route_assignments
for select using (
  public.is_staff_or_admin() or
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "route_assignments_manage" on public.route_assignments
for all using (public.is_staff_or_admin());

-- race sessions
create policy "race_sessions_select" on public.race_sessions
for select using (
  public.is_staff_or_admin() or
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "race_sessions_insert_own" on public.race_sessions
for insert with check (
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "race_sessions_update_own" on public.race_sessions
for update using (
  public.is_staff_or_admin() or
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

-- scan events
create policy "scan_events_select" on public.scan_events
for select using (
  public.is_staff_or_admin() or
  race_session_id in (
    select rs.id from public.race_sessions rs
    where rs.athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  )
);

create policy "scan_events_insert" on public.scan_events
for insert with check (
  race_session_id in (
    select rs.id from public.race_sessions rs
    where rs.athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
  )
);

-- results
create policy "results_public_select" on public.results
for select using (true);

create policy "results_insert_own" on public.results
for insert with check (
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "results_update_own" on public.results
for update using (
  athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
);

create policy "results_manage" on public.results
for all using (public.is_staff_or_admin());
