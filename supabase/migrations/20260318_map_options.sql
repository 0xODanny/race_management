-- Map options (multiple drafts + one live) for offline map packages

create table if not exists public.event_map_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','live')),

  -- Minimal payload for now: checkpoints/waymarks.
  checkpoints jsonb not null,

  -- Optional package settings (used for tile downloads / map bounding box).
  bounding_box jsonb,
  min_zoom int not null default 13,
  max_zoom int not null default 15,
  tile_template_url text not null default 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger event_map_options_updated_at
before update on public.event_map_options
for each row execute function public.touch_updated_at();

-- Enforce at most one live option per event.
create unique index if not exists event_map_options_one_live_per_event
on public.event_map_options(event_id)
where status = 'live';

alter table public.event_map_options enable row level security;

-- Public can read ONLY the live option (used by public offline map pages).
create policy "event_map_options_select_live" on public.event_map_options
for select using (status = 'live' or public.is_admin());

-- Admin manages drafts/live.
create policy "event_map_options_admin_all" on public.event_map_options
for all using (public.is_admin());

-- Publish helper: atomically mark one option live and demote others.
create or replace function public.publish_event_map_option(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  select event_id into v_event_id from public.event_map_options where id = p_option_id;
  if v_event_id is null then
    raise exception 'option not found';
  end if;

  update public.event_map_options
  set status = 'draft'
  where event_id = v_event_id
    and status = 'live'
    and id <> p_option_id;

  update public.event_map_options
  set status = 'live'
  where id = p_option_id;
end;
$$;

grant execute on function public.publish_event_map_option(uuid) to authenticated;
