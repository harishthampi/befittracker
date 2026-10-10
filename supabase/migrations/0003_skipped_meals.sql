-- Meals a person marked as "skipped" on a given day (e.g. no morning snack today).
-- Skipped meals are hidden from that day's diary; adding food to one un-skips it.
-- Later, the "log all meals" daily task will treat a skipped meal as done.

create table if not exists public.skipped_meals (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  meal       public.meal not null,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, meal)
);

alter table public.skipped_meals enable row level security;

drop policy if exists "own skipped meals" on public.skipped_meals;
create policy "own skipped meals" on public.skipped_meals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
