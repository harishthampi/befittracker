-- Usernames instead of email sign-up. Run after 0001-0004. Safe to re-run.
-- The username is stored on the profile (unique, case-insensitive) and copied from the
-- sign-up form by the same trigger that creates the profile.

alter table public.profiles add column if not exists username text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9][a-z0-9._]{2,19}$');
  end if;
end;
$$;

create unique index if not exists profiles_username_unique on public.profiles (username) where username is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen text := new.raw_user_meta_data ->> 'role';
  uname text := lower(new.raw_user_meta_data ->> 'username');
begin
  insert into public.profiles (id, role, display_name, username)
  values (
    new.id,
    case when chosen in ('user', 'instructor') then chosen::public.app_role else null end,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', uname), 80),
    case when uname ~ '^[a-z0-9][a-z0-9._]{2,19}$' then uname else null end
  );
  return new;
end;
$$;
