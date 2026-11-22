-- ============================================================================
-- DoseSaathi — 001: profiles, roles, and privilege-escalation protection
-- ============================================================================
-- Apply FIRST, in the Supabase Dashboard → SQL Editor (paste the whole file
-- and click Run). Idempotent where practical: re-running it is safe.
--
-- SECURITY MODEL
-- -------------
-- * Public registration offers ONLY patient and caregiver.
-- * The role in sign-up metadata is NEVER trusted: handle_new_user()
--   clamps it to patient/caregiver, so a crafted signup with
--   role='healthcare_professional' or role='admin' still becomes a patient.
-- * 'healthcare_professional' and 'admin' are granted later by an existing
--   admin (SQL Editor / admin tooling with service_role), never by the
--   user themself.
-- * prevent_privilege_escalation() blocks any non-admin from changing
--   `role` on any profile row — even their own.
-- * Profile reads are deliberately narrow: a user reads/updates their own
--   profile; admins read/update all profiles (needed to grant roles).
--   Care-team access to a patient's profile (name, language) is added in
--   004_rls.sql via can_access_patient(), once the connection tables exist.
-- * There is NO public INSERT policy on profiles: rows are created only
--   by the handle_new_user() trigger (SECURITY DEFINER) on signup.
-- * set_updated_at() is defined here and reused by every later migration.
-- ============================================================================

-- 1. Role enum ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'patient', 'caregiver', 'healthcare_professional', 'admin'
    );
  end if;
end
$$;

-- 2. Profiles table ----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role public.user_role not null default 'patient',
  preferred_language text not null default 'en',
  timezone text not null default 'Asia/Kolkata',
  caregiver_contact text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. updated_at maintenance --------------------------------------------------
-- Defined here so every later migration can reuse it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 4. Admin helper ------------------------------------------------------------
-- SECURITY DEFINER so it can read profiles without recursing into the RLS
-- policies that call it. search_path is pinned to public.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 5. Row Level Security ------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Users can update their own row — but the trigger in section 7 blocks any
-- change to `role` unless the caller is an admin.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can update any profile — this is how 'healthcare_professional'
-- and 'admin' roles are granted after signup.
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Admins can delete profiles (account removal; health rows cascade).
drop policy if exists "Admins can delete profiles" on public.profiles;
create policy "Admins can delete profiles"
  on public.profiles for delete
  using (public.is_admin());

-- NOTE: deliberately NO insert policy — see the header.

-- 6. Signup trigger — create the profile, clamp the role --------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  safe_role public.user_role := 'patient';
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'patient');

  -- THE CLAMP: only patient/caregiver can ever come from self-signup.
  -- 'healthcare_professional', 'admin', or any other value falls through
  -- to 'patient'. Privileged roles are granted later, by an admin only.
  if requested_role in ('patient', 'caregiver') then
    safe_role := requested_role::public.user_role;
  end if;

  insert into public.profiles (
    id, full_name, email, phone, role, preferred_language, timezone,
    caregiver_contact, onboarding_completed
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'email', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    safe_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_language', ''), 'en'),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Asia/Kolkata'),
    nullif(new.raw_user_meta_data ->> 'caregiver_contact', ''),
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7. Anti-escalation trigger — guard the privileged column ------------------
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  -- Trusted writers bypass the check:
  --   * 'service_role' — Edge Functions / backend code granting roles.
  --   * '' (no JWT at all) — a direct database session (SQL Editor / psql),
  --     i.e. the project owner. PostgREST always sends a JWT (anon or
  --     authenticated), so this can never be reached from the frontend.
  --     This is what makes bootstrapping the first admin possible.
  if jwt_role in ('service_role', '') then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only administrators can change role.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_privilege_escalation on public.profiles;
create trigger prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();

-- ============================================================================
-- 8. Bootstrap the first admin (run AFTER signing up normally once)
-- ============================================================================
-- Sign up through the app as a patient/caregiver, then run this in the
-- SQL Editor (replace the email), then sign out and sign in again:
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'admin@example.com';
-- ============================================================================
