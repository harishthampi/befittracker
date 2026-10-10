-- BeFitTracker V1 schema (web app, no AI).
-- Run in the Supabase SQL editor, or with `supabase db push`.
--
-- Rules followed throughout:
--   * Every table has Row-Level Security (RLS) ON. A signed-in person can only
--     touch rows where user_id = auth.uid(). Instructor access comes later (V1.1)
--     through coach_links, which is created now but not yet used by any policy.
--   * "local_date" is the person's own calendar day (their time zone), so a
--     snack at 11:30 pm in Toronto counts on that day, not on the UTC day.
--   * Food entries store a snapshot of the nutrients, so a later database change
--     never rewrites someone's history.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('user', 'instructor');
create type public.sex as enum ('male', 'female');
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'very', 'extra');
create type public.goal as enum ('lose', 'maintain', 'gain');
create type public.meal as enum ('breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner');
create type public.food_source as enum ('usda', 'off', 'fatsecret', 'custom');

-- ---------------------------------------------------------------------------
-- profiles: one row per account, created automatically on sign-up (trigger below)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           public.app_role,               -- null until chosen (Google sign-ups pick it in onboarding)
  display_name   text check (char_length(display_name) <= 80),
  birth_date     date,
  sex            public.sex,
  height_cm      numeric(5,1) check (height_cm between 100 and 250),
  weight_kg      numeric(5,1) check (weight_kg between 30 and 300),
  activity_level public.activity_level,
  goal           public.goal,
  units          text not null default 'metric' check (units in ('metric', 'imperial')),
  timezone       text not null default 'America/Toronto',
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- Copy the role chosen on the sign-up form (stored in auth metadata) into the profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    case when chosen in ('user', 'instructor') then chosen::public.app_role else null end,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- targets: daily goals, versioned by effective_from so old days keep old targets
-- ---------------------------------------------------------------------------
create table public.targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  kcal           int  not null check (kcal between 800 and 6000),
  protein_g      int  not null check (protein_g between 0 and 500),
  carbs_g        int  not null check (carbs_g between 0 and 1000),
  fat_g          int  not null check (fat_g between 0 and 400),
  fiber_g        int  not null default 30,
  steps          int  not null default 8000 check (steps between 0 and 100000),
  active_kcal    int  not null default 400 check (active_kcal between 0 and 5000),
  water_ml       int  not null default 2500 check (water_ml between 0 and 10000),
  set_by         text not null default 'calculated' check (set_by in ('calculated', 'self', 'instructor')),
  created_at     timestamptz not null default now(),
  unique (user_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- foods: the shared lookup cache (owner_id null, written only by the server
-- with the service-role key) plus each person's own custom foods (owner_id set).
-- ---------------------------------------------------------------------------
create table public.foods (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.profiles (id) on delete cascade,
  source        public.food_source not null,
  source_id     text,
  name          text not null check (char_length(name) between 1 and 200),
  brand         text check (char_length(brand) <= 120),
  kcal_100g     numeric(7,2) not null check (kcal_100g >= 0 and kcal_100g <= 950),
  protein_100g  numeric(6,2) not null default 0 check (protein_100g between 0 and 100),
  carbs_100g    numeric(6,2) not null default 0 check (carbs_100g between 0 and 100),
  fat_100g      numeric(6,2) not null default 0 check (fat_100g between 0 and 100),
  fiber_100g    numeric(6,2) not null default 0 check (fiber_100g between 0 and 100),
  servings      jsonb not null default '[]'::jsonb,   -- [{ "label": "1 cup", "grams": 158 }]
  created_at    timestamptz not null default now()
);
-- One cached row per database item. Custom foods have source_id null, and nulls never clash.
create unique index foods_source_uq on public.foods (source, source_id);
create index foods_name_search on public.foods using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')));

-- ---------------------------------------------------------------------------
-- food_entries: what someone ate, in which of the five meals, on which day
-- ---------------------------------------------------------------------------
create table public.food_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  local_date  date not null,
  meal        public.meal not null,
  food_id     uuid references public.foods (id) on delete set null,
  source      public.food_source not null,
  source_id   text,
  name        text not null check (char_length(name) between 1 and 200),
  brand       text,
  quantity    numeric(8,2) not null check (quantity > 0),
  unit_label  text not null,                         -- e.g. "cup", "g", "1 medium egg"
  grams       numeric(8,2) not null check (grams > 0 and grams <= 5000),
  kcal        numeric(8,2) not null check (kcal >= 0),
  protein_g   numeric(7,2) not null default 0,
  carbs_g     numeric(7,2) not null default 0,
  fat_g       numeric(7,2) not null default 0,
  fiber_g     numeric(7,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index food_entries_user_day on public.food_entries (user_id, local_date);

-- ---------------------------------------------------------------------------
-- Activity typed in by hand (V1 has no phone sync)
-- ---------------------------------------------------------------------------
create table public.step_logs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  steps      int  not null check (steps between 0 and 150000),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  ml         int  not null check (ml between 1 and 5000),
  created_at timestamptz not null default now()
);
create index water_logs_user_day on public.water_logs (user_id, local_date);

create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  local_date   date not null,
  source       text not null default 'manual' check (source in ('manual', 'hevy')),
  external_id  text,
  type         text not null check (char_length(type) between 1 and 60),
  minutes      int  not null check (minutes between 1 and 600),
  active_kcal  int  not null check (active_kcal between 0 and 5000),
  created_at   timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index workouts_user_day on public.workouts (user_id, local_date);

-- ---------------------------------------------------------------------------
-- coach_links: created now so the instructor portal (V1.1) has a home.
-- No policy grants instructors access to client data yet.
-- ---------------------------------------------------------------------------
create table public.coach_links (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  client_id     uuid references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  scopes        text[] not null default '{}',
  invite_code   text unique,
  expires_at    timestamptz,
  approved_at   timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_summary: one row per person per day, computed on the fly.
-- security_invoker makes the view obey the RLS of the tables underneath.
-- ---------------------------------------------------------------------------
create view public.daily_summary with (security_invoker = true) as
with days as (
  select user_id, local_date from public.food_entries
  union select user_id, local_date from public.step_logs
  union select user_id, local_date from public.water_logs
  union select user_id, local_date from public.workouts
)
select
  d.user_id,
  d.local_date,
  coalesce((select sum(kcal)      from public.food_entries f where f.user_id = d.user_id and f.local_date = d.local_date), 0) as intake_kcal,
  coalesce((select sum(protein_g) from public.food_entries f where f.user_id = d.user_id and f.local_date = d.local_date), 0) as protein_g,
  coalesce((select sum(carbs_g)   from public.food_entries f where f.user_id = d.user_id and f.local_date = d.local_date), 0) as carbs_g,
  coalesce((select sum(fat_g)     from public.food_entries f where f.user_id = d.user_id and f.local_date = d.local_date), 0) as fat_g,
  coalesce((select steps          from public.step_logs s    where s.user_id = d.user_id and s.local_date = d.local_date), 0) as steps,
  coalesce((select sum(ml)        from public.water_logs w   where w.user_id = d.user_id and w.local_date = d.local_date), 0) as water_ml,
  coalesce((select sum(active_kcal) from public.workouts k   where k.user_id = d.user_id and k.local_date = d.local_date), 0) as workout_kcal
from days d;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.targets      enable row level security;
alter table public.foods        enable row level security;
alter table public.food_entries enable row level security;
alter table public.step_logs    enable row level security;
alter table public.water_logs   enable row level security;
alter table public.workouts     enable row level security;
alter table public.coach_links  enable row level security;

-- profiles: read and edit only your own. Role can be set once (null -> value) and never changed.
create policy "own profile: read"   on public.profiles for select using (id = auth.uid());
create policy "own profile: update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.lock_role()
returns trigger language plpgsql as $$
begin
  if old.role is not null and new.role is distinct from old.role then
    raise exception 'Role cannot be changed after it is set';
  end if;
  return new;
end;
$$;
create trigger profiles_lock_role before update on public.profiles
  for each row execute function public.lock_role();

-- Same "only my rows" rule for every personal table.
create policy "own targets"      on public.targets      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own food entries" on public.food_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own steps"        on public.step_logs    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own water"        on public.water_logs   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own workouts"     on public.workouts     for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- foods: everyone signed in can read the shared cache and their own custom foods;
-- people can only create or change custom foods they own.
create policy "foods: read shared + own" on public.foods for select
  using (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));
create policy "foods: write own custom" on public.foods for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and source = 'custom');

-- coach_links: each side can see links they are part of. Writes come in V1.1.
create policy "coach links: participants read" on public.coach_links for select
  using (instructor_id = auth.uid() or client_id = auth.uid());
