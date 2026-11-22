-- ============================================================================
-- DoseSaathi — 007: voice-call attempts, call responses, dose source
-- ============================================================================
-- Apply AFTER 006_call_prefs.sql, in the Supabase Dashboard → SQL Editor
-- (paste the whole file and click Run). Idempotent where practical:
-- re-running it is safe.
--
-- DATA MODEL
-- ----------
-- * call_attempts is one row per outbound reminder call. The UNIQUE
--   idempotency_key (patient + schedule + date + time + attempt number)
--   makes the scan-due-calls Edge Function idempotent: re-running the
--   scanner can never queue the same call twice.
-- * call_responses records what the patient actually did on the call
--   (keypad press or speech). A dose is NEVER marked taken from a call
--   unless a response row says the patient confirmed it — unanswered
--   calls, voicemail, busy, failed, and ambiguous input never confirm.
-- * dose_events.source records where a confirmation came from ('app',
--   'call', 'caregiver'). The pre-existing UNIQUE constraint on
--   (schedule_id, scheduled_date, scheduled_time) is NOT touched — it is
--   part of the duplicate-dose defence.
--
-- WRITES
-- ------
-- * There are deliberately NO client INSERT/UPDATE/DELETE policies on
--   these tables. Rows are written only by the Edge Functions, which run
--   with service_role and bypass RLS. The browser can only read.
-- * RLS read access: the patient themself, plus their ACTIVE caregiver
--   (caregiver_connections.status = 'active', via the is_caregiver_for()
--   helper from 003). Revoked or merely-pending caregivers see nothing.
-- ============================================================================

-- 1. Call attempts -----------------------------------------------------------
create table if not exists public.call_attempts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  schedule_id uuid not null references public.medication_schedules (id) on delete cascade,
  dose_event_id uuid references public.dose_events (id) on delete set null,
  scheduled_for timestamptz not null,
  attempt_number integer not null default 1
    check (attempt_number >= 1),
  status text not null default 'queued'
    check (status in (
      'queued', 'calling', 'completed', 'no_answer', 'busy', 'failed',
      'voicemail', 'cancelled'
    )),
  provider text not null default 'twilio',
  provider_call_sid text,
  idempotency_key text not null unique,
  retry_count integer not null default 0
    check (retry_count >= 0),
  next_retry_at timestamptz,
  escalation_status text not null default 'none'
    check (escalation_status in ('none', 'pending', 'notified', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Call responses ----------------------------------------------------------
create table if not exists public.call_responses (
  id uuid primary key default gen_random_uuid(),
  call_attempt_id uuid not null references public.call_attempts (id) on delete cascade,
  response_type text not null
    check (response_type in ('keypad', 'speech', 'none')),
  key_pressed text,
  speech_text text,
  confirmed boolean not null default false,
  recorded_at timestamptz not null default now()
);

-- 3. Dose events: record the confirmation source -----------------------------
-- Written as DO-block guarded ALTERs (instead of ADD COLUMN IF NOT
-- EXISTS) so the migration stays idempotent on every supported
-- Postgres version and parses under older libpg_query builds.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dose_events'
      and column_name = 'source'
  ) then
    alter table public.dose_events
      add column source text not null default 'app'
        check (source in ('app', 'call', 'caregiver'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dose_events'
      and column_name = 'call_attempt_id'
  ) then
    alter table public.dose_events
      add column call_attempt_id uuid
        references public.call_attempts (id) on delete set null;
  end if;
end
$$;

-- NOTE: the UNIQUE (schedule_id, scheduled_date, scheduled_time)
-- constraint from 002 is untouched — duplicate-dose defence stays intact.

-- 4. Indexes -----------------------------------------------------------------
create index if not exists call_attempts_patient_id_idx
  on public.call_attempts (patient_id);
create index if not exists call_attempts_scheduled_for_idx
  on public.call_attempts (scheduled_for);
create index if not exists call_attempts_status_idx
  on public.call_attempts (status);
create index if not exists call_attempts_next_retry_at_idx
  on public.call_attempts (next_retry_at);
create index if not exists call_attempts_dose_event_id_idx
  on public.call_attempts (dose_event_id);
create index if not exists call_responses_call_attempt_id_idx
  on public.call_responses (call_attempt_id);
create index if not exists dose_events_call_attempt_id_idx
  on public.dose_events (call_attempt_id);
-- NOTE: no separate index on call_attempts.idempotency_key — the unique
-- constraint already covers it.

-- 5. updated_at maintenance --------------------------------------------------
-- set_updated_at() is defined in 001. call_responses has no updated_at
-- column (append-only), so it gets no trigger.
drop trigger if exists set_updated_at on public.call_attempts;
create trigger set_updated_at
  before update on public.call_attempts
  for each row execute function public.set_updated_at();

-- 6. Access helper -----------------------------------------------------------
-- Resolve a call attempt to its patient, bypassing RLS on call_attempts
-- so the call_responses policies don't depend on call_attempts' own
-- policies to evaluate. Mirrors medication_patient_id() from 003.
create or replace function public.call_attempt_patient_id(call_attempt_uuid uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select patient_id from public.call_attempts where id = call_attempt_uuid;
$$;

-- 7. Row Level Security ------------------------------------------------------
alter table public.call_attempts enable row level security;
alter table public.call_responses enable row level security;

-- Patients read their own call attempts.
drop policy if exists "Patients can view their own call attempts"
  on public.call_attempts;
create policy "Patients can view their own call attempts"
  on public.call_attempts for select
  using (auth.uid() = patient_id);

-- Active caregivers read the patient's call attempts. Pending or revoked
-- connections grant nothing (is_caregiver_for checks status = 'active').
drop policy if exists "Active caregivers can view call attempts"
  on public.call_attempts;
create policy "Active caregivers can view call attempts"
  on public.call_attempts for select
  using (public.is_caregiver_for(patient_id));

-- Patients read responses on their own calls.
drop policy if exists "Patients can view their own call responses"
  on public.call_responses;
create policy "Patients can view their own call responses"
  on public.call_responses for select
  using (auth.uid() = public.call_attempt_patient_id(call_attempt_id));

-- Active caregivers read responses on the patient's calls.
drop policy if exists "Active caregivers can view call responses"
  on public.call_responses;
create policy "Active caregivers can view call responses"
  on public.call_responses for select
  using (
    public.is_caregiver_for(public.call_attempt_patient_id(call_attempt_id))
  );

-- NOTE: deliberately NO insert/update/delete policies — writes are
-- service_role only, from the Edge Functions in supabase/functions/.
