-- BeFitTracker coaching: instructors invite clients, clients choose what to share.
-- Run after 0001-0003. Safe to re-run.
--
-- Security model
--   * A client shares nothing until they accept an invite code, and they pick the scopes:
--       activity  = steps, workouts, calories burned
--       nutrition = food diary, macros, water, skipped meals
--       body      = age, sex, height, weight
--       goals     = calorie/macro/step targets and goal type
--   * Every instructor read goes through coach_can(client, scope), which checks for an ACTIVE
--     link with that scope. Revoking a link (either side) cuts access immediately.
--   * All writes (invites, accepting, notes, proposals) go through SECURITY DEFINER functions
--     that validate the caller, so the tables themselves only need SELECT policies.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.valid_scopes(s text[])
returns boolean language sql immutable as $$
  select coalesce(s <@ array['activity','nutrition','body','goals']::text[], false)
$$;

-- Does the signed-in instructor have an active link to this client with this scope?
create or replace function public.coach_can(p_client uuid, p_scope text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_links
    where instructor_id = auth.uid()
      and client_id = p_client
      and status = 'active'
      and p_scope = any (scopes)
  )
$$;

-- An 8-character code without look-alike characters (no 0/O, 1/I/L).
create or replace function public.new_invite_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
alter table public.coach_links
  add column if not exists requested_scopes text[] not null default '{activity,nutrition,goals}';

create index if not exists coach_links_instructor on public.coach_links (instructor_id, status);
create index if not exists coach_links_client on public.coach_links (client_id, status);

create table if not exists public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.coach_links (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  local_date date,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists coach_notes_link on public.coach_notes (link_id, created_at);

create table if not exists public.target_proposals (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid not null references public.coach_links (id) on delete cascade,
  kcal         int not null check (kcal between 800 and 6000),
  protein_g    int not null check (protein_g between 0 and 500),
  carbs_g      int not null check (carbs_g between 0 and 1000),
  fat_g        int not null check (fat_g between 0 and 400),
  steps        int not null check (steps between 0 and 100000),
  message      text check (char_length(message) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'replaced')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists target_proposals_link on public.target_proposals (link_id, status);

alter table public.coach_notes enable row level security;
alter table public.target_proposals enable row level security;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------
-- Instructors may also delete their own unused invites.
drop policy if exists "coach links: instructor deletes pending" on public.coach_links;
create policy "coach links: instructor deletes pending" on public.coach_links for delete
  using (instructor_id = auth.uid() and status = 'pending');

drop policy if exists "coach notes: participants read" on public.coach_notes;
create policy "coach notes: participants read" on public.coach_notes for select using (
  exists (select 1 from public.coach_links l
          where l.id = link_id and auth.uid() in (l.instructor_id, l.client_id))
);

drop policy if exists "proposals: participants read" on public.target_proposals;
create policy "proposals: participants read" on public.target_proposals for select using (
  exists (select 1 from public.coach_links l
          where l.id = link_id and auth.uid() in (l.instructor_id, l.client_id))
);

-- Instructor read access to client data, by scope. These are added to (OR'd with) the
-- existing "own rows" policies, so clients still see everything of their own.
drop policy if exists "coach reads food"     on public.food_entries;
drop policy if exists "coach reads water"    on public.water_logs;
drop policy if exists "coach reads skipped"  on public.skipped_meals;
drop policy if exists "coach reads steps"    on public.step_logs;
drop policy if exists "coach reads workouts" on public.workouts;
drop policy if exists "coach reads targets"  on public.targets;
create policy "coach reads food"     on public.food_entries  for select using (public.coach_can(user_id, 'nutrition'));
create policy "coach reads water"    on public.water_logs    for select using (public.coach_can(user_id, 'nutrition'));
create policy "coach reads skipped"  on public.skipped_meals for select using (public.coach_can(user_id, 'nutrition'));
create policy "coach reads steps"    on public.step_logs     for select using (public.coach_can(user_id, 'activity'));
create policy "coach reads workouts" on public.workouts      for select using (public.coach_can(user_id, 'activity'));
create policy "coach reads targets"  on public.targets       for select using (public.coach_can(user_id, 'goals'));

-- ---------------------------------------------------------------------------
-- Instructor functions
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(p_scopes text[])
returns table (id uuid, invite_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if (select role from public.profiles p where p.id = auth.uid()) is distinct from 'instructor' then
    raise exception 'Only instructors can create invites';
  end if;
  if not public.valid_scopes(p_scopes) or cardinality(p_scopes) = 0 then
    raise exception 'Choose at least one thing to ask for';
  end if;
  if (select count(*) from public.coach_links l
      where l.instructor_id = auth.uid() and l.status = 'pending' and l.expires_at > now()) >= 20 then
    raise exception 'You have 20 open invites. Cancel some first.';
  end if;

  for attempt in 1..5 loop
    v_code := public.new_invite_code();
    begin
      return query
        insert into public.coach_links (instructor_id, status, invite_code, requested_scopes, expires_at)
        values (auth.uid(), 'pending', v_code, p_scopes, now() + interval '7 days')
        returning coach_links.id, coach_links.invite_code, coach_links.expires_at;
      return;
    exception when unique_violation then
      -- extremely rare: try another code
    end;
  end loop;
  raise exception 'Could not create a code, please try again';
end;
$$;

-- The instructor's active clients, with profile details limited by what each client shares.
create or replace function public.coach_clients()
returns table (
  link_id uuid, client_id uuid, display_name text, timezone text, scopes text[], approved_at timestamptz,
  age int, sex public.sex, height_cm numeric, weight_kg numeric, goal public.goal
)
language sql stable security definer set search_path = public as $$
  select l.id, p.id, coalesce(p.display_name, 'Client'), p.timezone, l.scopes, l.approved_at,
         case when 'body' = any (l.scopes) and p.birth_date is not null
              then extract(year from age(p.birth_date))::int end,
         case when 'body' = any (l.scopes) then p.sex end,
         case when 'body' = any (l.scopes) then p.height_cm end,
         case when 'body' = any (l.scopes) then p.weight_kg end,
         case when 'goals' = any (l.scopes) then p.goal end
  from public.coach_links l
  join public.profiles p on p.id = l.client_id
  where l.instructor_id = auth.uid() and l.status = 'active'
  order by l.approved_at
$$;

-- Daily totals for one client, only for the scopes they share. Burned calories use the
-- client's own weight (the same estimate they see), without revealing the weight itself.
create or replace function public.coach_daily(p_client uuid, p_from date, p_to date)
returns table (local_date date, steps int, intake_kcal numeric, workout_kcal int, burned_kcal int)
language plpgsql stable security definer set search_path = public as $$
declare
  can_activity boolean := public.coach_can(p_client, 'activity');
  can_nutrition boolean := public.coach_can(p_client, 'nutrition');
  w numeric;
begin
  if not (can_activity or can_nutrition) then
    return;
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Date range too long';
  end if;
  select coalesce(weight_kg, 70) into w from public.profiles where id = p_client;

  return query
  with days as (
    select d::date as d from generate_series(p_from, p_to, interval '1 day') d
  ),
  s as (select sl.local_date, sl.steps from public.step_logs sl
        where sl.user_id = p_client and sl.local_date between p_from and p_to),
  f as (select fe.local_date, sum(fe.kcal) as kcal from public.food_entries fe
        where fe.user_id = p_client and fe.local_date between p_from and p_to group by 1),
  k as (select wo.local_date, sum(wo.active_kcal)::int as kcal from public.workouts wo
        where wo.user_id = p_client and wo.local_date between p_from and p_to group by 1)
  select days.d,
         case when can_activity then coalesce(s.steps, 0) end,
         case when can_nutrition then coalesce(f.kcal, 0) end,
         case when can_activity then coalesce(k.kcal, 0) end,
         case when can_activity then round(coalesce(s.steps, 0) * 0.04 * w / 70 + coalesce(k.kcal, 0))::int end
  from days
  left join s on s.local_date = days.d
  left join f on f.local_date = days.d
  left join k on k.local_date = days.d
  where s.steps is not null or f.kcal is not null or k.kcal is not null
  order by days.d;
end;
$$;

create or replace function public.propose_targets(
  p_link uuid, p_kcal int, p_protein int, p_carbs int, p_fat int, p_steps int, p_message text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.coach_links l
                 where l.id = p_link and l.instructor_id = auth.uid() and l.status = 'active'
                   and 'goals' = any (l.scopes)) then
    raise exception 'This client does not share goals with you';
  end if;
  update public.target_proposals set status = 'replaced', responded_at = now()
    where link_id = p_link and status = 'pending';
  insert into public.target_proposals (link_id, kcal, protein_g, carbs_g, fat_g, steps, message)
    values (p_link, p_kcal, p_protein, p_carbs, p_fat, p_steps, nullif(trim(p_message), ''))
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------
-- What an invite code asks for, shown before the client agrees.
create or replace function public.preview_invite(p_code text)
returns table (instructor_name text, requested_scopes text[], expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(p.display_name, 'Your instructor'), l.requested_scopes, l.expires_at
  from public.coach_links l
  join public.profiles p on p.id = l.instructor_id
  where auth.uid() is not null
    and l.invite_code = upper(trim(p_code))
    and l.status = 'pending'
    and l.expires_at > now()
$$;

create or replace function public.accept_invite(p_code text, p_scopes text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_link public.coach_links;
  v_existing uuid;
begin
  if (select role from public.profiles where id = auth.uid()) is distinct from 'user' then
    raise exception 'Only user accounts can join a coach';
  end if;
  if not public.valid_scopes(p_scopes) or cardinality(p_scopes) = 0 then
    raise exception 'Choose at least one thing to share';
  end if;

  select * into v_link from public.coach_links
    where invite_code = upper(trim(p_code)) and status = 'pending' and expires_at > now()
    for update;
  if not found then
    raise exception 'That code is invalid or has expired';
  end if;
  if v_link.instructor_id = auth.uid() then
    raise exception 'You cannot join your own invite';
  end if;

  -- Already coached by this instructor: just update what is shared, and use up the code.
  select id into v_existing from public.coach_links
    where instructor_id = v_link.instructor_id and client_id = auth.uid() and status = 'active';
  if v_existing is not null then
    update public.coach_links set scopes = p_scopes where id = v_existing;
    delete from public.coach_links where id = v_link.id;
    return v_existing;
  end if;

  update public.coach_links
    set client_id = auth.uid(), status = 'active', scopes = p_scopes,
        approved_at = now(), invite_code = null
    where id = v_link.id;
  return v_link.id;
end;
$$;

-- Coaches of the signed-in client.
create or replace function public.my_coaches()
returns table (link_id uuid, instructor_name text, scopes text[], approved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, coalesce(p.display_name, 'Instructor'), l.scopes, l.approved_at
  from public.coach_links l
  join public.profiles p on p.id = l.instructor_id
  where l.client_id = auth.uid() and l.status = 'active'
  order by l.approved_at
$$;

create or replace function public.set_link_scopes(p_link uuid, p_scopes text[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.valid_scopes(p_scopes) or cardinality(p_scopes) = 0 then
    raise exception 'Choose at least one thing to share, or stop sharing instead';
  end if;
  update public.coach_links set scopes = p_scopes
    where id = p_link and client_id = auth.uid() and status = 'active';
  if not found then raise exception 'Link not found'; end if;
end;
$$;

create or replace function public.respond_proposal(p_proposal uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.target_proposals;
  v_client uuid;
  v_today date;
  cur public.targets;
begin
  select tp.* into v from public.target_proposals tp
    join public.coach_links l on l.id = tp.link_id
    where tp.id = p_proposal and tp.status = 'pending' and l.client_id = auth.uid() and l.status = 'active'
    for update of tp;
  if not found then raise exception 'Suggestion not found'; end if;

  update public.target_proposals
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_proposal;
  if not p_accept then return; end if;

  v_client := auth.uid();
  select (now() at time zone coalesce(timezone, 'America/Toronto'))::date into v_today
    from public.profiles where id = v_client;
  select * into cur from public.targets where user_id = v_client and effective_from <= v_today
    order by effective_from desc limit 1;

  insert into public.targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g, fiber_g,
                              steps, active_kcal, water_ml, set_by)
  values (v_client, v_today, v.kcal, v.protein_g, v.carbs_g, v.fat_g, coalesce(cur.fiber_g, 30),
          v.steps, coalesce(cur.active_kcal, 400), coalesce(cur.water_ml, 2500), 'instructor')
  on conflict (user_id, effective_from) do update set
    kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g, steps = excluded.steps, set_by = 'instructor';
end;
$$;

-- ---------------------------------------------------------------------------
-- Both sides
-- ---------------------------------------------------------------------------
create or replace function public.end_link(p_link uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.coach_links set status = 'revoked', revoked_at = now()
    where id = p_link and status = 'active' and auth.uid() in (instructor_id, client_id);
  if not found then raise exception 'Link not found'; end if;
  update public.target_proposals set status = 'replaced', responded_at = now()
    where link_id = p_link and status = 'pending';
end;
$$;

create or replace function public.add_note(p_link uuid, p_body text, p_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.coach_links
                 where id = p_link and status = 'active' and auth.uid() in (instructor_id, client_id)) then
    raise exception 'Link not found';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 or char_length(p_body) > 1000 then
    raise exception 'Notes are 1 to 1,000 characters';
  end if;
  insert into public.coach_notes (link_id, author_id, local_date, body)
    values (p_link, auth.uid(), p_date, trim(p_body))
    returning id into v_id;
  return v_id;
end;
$$;

-- Marks the other person's notes as read.
create or replace function public.mark_notes_read(p_link uuid)
returns void
language sql security definer set search_path = public as $$
  update public.coach_notes n set read_at = now()
  where n.link_id = p_link and n.read_at is null and n.author_id <> auth.uid()
    and exists (select 1 from public.coach_links l
                where l.id = p_link and auth.uid() in (l.instructor_id, l.client_id))
$$;

-- ---------------------------------------------------------------------------
-- Only signed-in people may call these.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'coach_can(uuid,text)', 'create_invite(text[])', 'coach_clients()', 'coach_daily(uuid,date,date)',
    'propose_targets(uuid,integer,integer,integer,integer,integer,text)', 'preview_invite(text)',
    'accept_invite(text,text[])', 'my_coaches()', 'set_link_scopes(uuid,text[])',
    'respond_proposal(uuid,boolean)', 'end_link(uuid)', 'add_note(uuid,text,date)', 'mark_notes_read(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function public.%s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
end;
$$;
