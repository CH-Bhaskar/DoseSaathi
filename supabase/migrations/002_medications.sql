-- ============================================================================
-- DoseSaathi — 002: medications, schedules, and dose events
-- ============================================================================
-- Apply AFTER 001_profiles.sql, in the Supabase Dashboard → SQL Editor
-- (paste the whole file and click Run). Idempotent where practical:
-- re-running it is safe.
--
-- DATA MODEL
-- ----------
-- * Every health row belongs to exactly one patient — directly via
--   patient_id, or indirectly via medication_id → medications.patient_id.
-- * medication_schedules holds the recurring times (time_of_day +
--   days_of_week, ISO numbering 1 = Monday … 7 = Sunday). One medication
--   has one schedule row per time of day.
-- * dose_events holds one row per scheduled dose occurrence. The UNIQUE
--   constraint on (schedule_id, scheduled_date, scheduled_time) makes the
--   daily dose-generation / sync job idempotent: re-running it can never
--   create duplicate dose rows.
-- * RLS policies live in 004_rls.sql (they need the access helpers from
--   003). This file only creates tables, indexes, and updated_at triggers.
-- ============================================================================

-- 1. Medications -------------------------------------------------------------
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  brand_name text,
  strength text not null,
  form text not null
    check (form in ('tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'drops', 'cream', 'other')),
  instructions text not null,
  dose_amount text not null,
  frequency text not null
    check (frequency in ('once_daily', 'twice_daily', 'three_times_daily', 'four_times_daily', 'as_needed', 'weekly', 'custom')),
  start_date date not null,
  end_date date,
  prescriber_name text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Medication schedules ----------------------------------------------------
create table if not exists public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  time_of_day time not null,
  days_of_week integer[] not null default '{1,2,3,4,5,6,7}'
    check (days_of_week <@ array[1,2,3,4,5,6,7] and cardinality(days_of_week) > 0),
  food_rule text not null default 'none'
    check (food_rule in ('none', 'before', 'with', 'after')),
  created_at timestamptz not null default now()
);

-- 3. Dose events -------------------------------------------------------------
create table if not exists public.dose_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.medication_schedules (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time not null,
  status text not null default 'pending'
    check (status in ('pending', 'taken', 'missed', 'skipped')),
  action_at timestamptz,
  note text,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, scheduled_date, scheduled_time)
);

-- 4. Indexes -----------------------------------------------------------------
create index if not exists medications_patient_id_idx
  on public.medications (patient_id);
create index if not exists medication_schedules_medication_id_idx
  on public.medication_schedules (medication_id);
create index if not exists dose_events_patient_id_idx
  on public.dose_events (patient_id);
create index if not exists dose_events_medication_id_idx
  on public.dose_events (medication_id);
create index if not exists dose_events_scheduled_date_idx
  on public.dose_events (scheduled_date);
-- NOTE: no separate index on dose_events.schedule_id — the unique
-- (schedule_id, scheduled_date, scheduled_time) constraint already indexes
-- schedule_id as its leftmost key.

-- 5. updated_at maintenance --------------------------------------------------
-- set_updated_at() is defined in 001. medication_schedules has no
-- updated_at column, so it gets no trigger.
drop trigger if exists set_updated_at on public.medications;
create trigger set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.dose_events;
create trigger set_updated_at
  before update on public.dose_events
  for each row execute function public.set_updated_at();
