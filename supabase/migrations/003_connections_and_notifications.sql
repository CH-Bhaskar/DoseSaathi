-- ============================================================================
-- DoseSaathi — 003: connections, notifications, notes, audit, access helpers
-- ============================================================================
-- Apply AFTER 002_medications.sql, in the Supabase Dashboard → SQL Editor
-- (paste the whole file and click Run). Idempotent where practical:
-- re-running it is safe.
--
-- DATA MODEL
-- ----------
-- * caregiver_connections / healthcare_connections link a patient to a
--   caregiver / healthcare professional. The invitee is identified by
--   invited_email BEFORE they have an account (caregiver_id /
--   professional_id stays null until they claim the invitation); the
--   connection only grants access once status = 'active'.
-- * notification_preferences is one row per user (user_id unique).
-- * notification_logs is an append-only delivery log, written by backend
--   code (service_role). Clients never insert into it.
-- * follow_up_notes are written by healthcare professionals for patients
--   they can access.
-- * audit_events is an append-only log of user actions (user_id =
--   auth.uid() on insert). Clients never update or delete it.
--
-- ACCESS HELPERS
-- --------------
-- All helpers that read tables are SECURITY DEFINER so they can read past
-- RLS without recursing into the policies that call them. search_path is
-- pinned to public.
--
-- DELIBERATE DEVIATION (security): can_access_patient() and
-- can_write_patient() do NOT include is_admin(). Per the DoseSaathi spec,
-- admins get NO access to private medication records — their policies
-- cover only profiles, audit_events, and support_requests (see 004).
-- is_admin() is therefore used directly in those three tables' policies
-- only, never folded into the patient-access helpers.
-- ============================================================================

-- 1. Caregiver connections ---------------------------------------------------
create table if not exists public.caregiver_connections (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid references public.profiles (id) on delete cascade,
  invited_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  invite_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, invited_email)
);

-- 2. Notification preferences ------------------------------------------------
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  grace_period_minutes integer not null default 60
    check (grace_period_minutes >= 5 and grace_period_minutes <= 240),
  browser_notifications boolean not null default false,
  in_app_alerts boolean not null default true,
  caregiver_alerts_enabled boolean not null default true,
  include_med_details boolean not null default false,
  reminder_minutes_before integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Notification logs -------------------------------------------------------
create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete set null,
  recipient_email text,
  type text not null
    check (type in ('dose_reminder', 'missed_dose_alert', 'caregiver_invite', 'system')),
  channel text not null
    check (channel in ('in_app', 'email', 'sms')),
  message text not null,
  status text not null default 'queued'
    check (status in ('queued', 'delivered', 'failed', 'unavailable')),
  created_at timestamptz not null default now()
);

-- 4. Healthcare connections --------------------------------------------------
create table if not exists public.healthcare_connections (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid references public.profiles (id) on delete cascade,
  invited_email text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Follow-up notes ---------------------------------------------------------
create table if not exists public.follow_up_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

-- 6. Audit events ------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- 7. Indexes -----------------------------------------------------------------
create index if not exists caregiver_connections_patient_id_idx
  on public.caregiver_connections (patient_id);
create index if not exists caregiver_connections_caregiver_id_idx
  on public.caregiver_connections (caregiver_id);
create index if not exists caregiver_connections_invited_email_idx
  on public.caregiver_connections (invited_email);
create index if not exists notification_logs_patient_id_idx
  on public.notification_logs (patient_id);
create index if not exists notification_logs_recipient_id_idx
  on public.notification_logs (recipient_id);
create index if not exists healthcare_connections_patient_id_idx
  on public.healthcare_connections (patient_id);
create index if not exists healthcare_connections_professional_id_idx
  on public.healthcare_connections (professional_id);
create index if not exists follow_up_notes_patient_id_idx
  on public.follow_up_notes (patient_id);
create index if not exists audit_events_user_id_idx
  on public.audit_events (user_id);
-- NOTE: no index on notification_preferences.user_id — the unique
-- constraint already covers it.

-- 8. updated_at maintenance --------------------------------------------------
-- set_updated_at() is defined in 001. notification_logs, follow_up_notes,
-- and audit_events have no updated_at column (append-only / immutable),
-- so they get no trigger.
do $$
declare
  t text;
begin
  foreach t in array array[
    'caregiver_connections', 'notification_preferences',
    'healthcare_connections'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end
$$;

-- 9. Access helpers ----------------------------------------------------------
-- The caller is an ACTIVE caregiver for this patient.
create or replace function public.is_caregiver_for(patient_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.caregiver_connections
    where caregiver_id = auth.uid()
      and patient_id = patient_uuid
      and status = 'active'
  );
$$;

-- The caller is an ACTIVE healthcare professional for this patient.
create or replace function public.is_professional_for(patient_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.healthcare_connections
    where professional_id = auth.uid()
      and patient_id = patient_uuid
      and status = 'active'
  );
$$;

-- Composite READ access: the patient themself, their active caregiver, or
-- their active healthcare professional. Admins are deliberately NOT
-- included (see the header note).
create or replace function public.can_access_patient(patient_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() = patient_uuid
    or public.is_caregiver_for(patient_uuid)
    or public.is_professional_for(patient_uuid);
$$;

-- Composite WRITE access: the patient themself ONLY. Caregivers and
-- healthcare professionals are read-only on patient health rows (the one
-- exception — HCPs writing follow_up_notes — uses is_professional_for()
-- directly in 004). Admins are deliberately NOT included (see header).
create or replace function public.can_write_patient(patient_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() = patient_uuid;
$$;

-- Resolve a medication to its patient, bypassing RLS on medications so
-- policies on medication_schedules don't depend on medications' own
-- policies to evaluate.
create or replace function public.medication_patient_id(medication_uuid uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select patient_id from public.medications where id = medication_uuid;
$$;
