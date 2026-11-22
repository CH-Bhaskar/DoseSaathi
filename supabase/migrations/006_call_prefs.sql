-- ============================================================================
-- DoseSaathi — 006: voice-call preferences, consent, and private settings
-- ============================================================================
-- Apply AFTER 005_medication_images.sql, in the Supabase Dashboard → SQL
-- Editor (paste the whole file and click Run). Idempotent where practical:
-- re-running it is safe.
--
-- DATA MODEL
-- ----------
-- * call_preferences — one row per user: whether voice-call reminders are
--   on, the phone number to call, language/voice/speed, retry and quiet
--   hours, escalation, and the consent flags. Read by the server-side
--   call queue (Edge Functions, migration 007) before any call is made.
--   Table and column names are part of that contract — do not rename.
-- * medicine_call_settings — per-medicine call toggle. Absence of a row
--   means the default (calls on for that medicine); a row with
--   calls_enabled = false opts that medicine out.
-- * patient_private_settings — private, patient-only settings. The
--   pregnancy fields here are NEVER shown to caregivers, healthcare
--   professionals, or admins, and are never used by the call queue. They
--   only help the patient follow clinician-provided instructions.
--
-- ACCESS
-- ------
-- * All three tables are OWNER-ONLY: no caregiver, healthcare
--   professional, or admin policy exists. The backend (service_role)
--   bypasses RLS and must repeat the owner check before acting on a
--   user's behalf — in particular, it must never read
--   patient_private_settings for anyone but the patient, and must never
--   include pregnancy information in a call, notification, or dashboard.
-- ============================================================================

-- 1. Call preferences --------------------------------------------------------
create table if not exists public.call_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  calls_enabled boolean not null default false,
  paused boolean not null default false,
  phone_number text,
  language text not null default 'en'
    check (language in ('en', 'kn')),
  voice_name text,
  speech_rate numeric not null default 1.0,
  retry_count integer not null default 1
    check (retry_count >= 0 and retry_count <= 3),
  retry_delay_minutes integer not null default 15,
  quiet_hours_start time not null default '21:00',
  quiet_hours_end time not null default '07:00',
  escalation_enabled boolean not null default false,
  escalation_delay_minutes integer not null default 30,
  speak_medicine_details boolean not null default false,
  consent_calls boolean not null default false,
  consent_escalation boolean not null default false,
  consent_calls_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Per-medicine call settings ----------------------------------------------
create table if not exists public.medicine_call_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  calls_enabled boolean not null default true,
  unique (user_id, medication_id)
);

-- 3. Patient-private settings ------------------------------------------------
create table if not exists public.patient_private_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pregnancy_opt_in boolean not null default false,
  pregnancy_clinician_note text,
  pregnancy_visible_to_caregiver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Indexes -----------------------------------------------------------------
-- NOTE: no index on call_preferences.user_id or
-- patient_private_settings.user_id — the unique / primary-key constraints
-- already cover them.
create index if not exists medicine_call_settings_user_id_idx
  on public.medicine_call_settings (user_id);
create index if not exists medicine_call_settings_medication_id_idx
  on public.medicine_call_settings (medication_id);

-- 5. updated_at maintenance --------------------------------------------------
-- set_updated_at() is defined in 001. medicine_call_settings has no
-- updated_at column, so it gets no trigger.
drop trigger if exists set_updated_at on public.call_preferences;
create trigger set_updated_at
  before update on public.call_preferences
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.patient_private_settings;
create trigger set_updated_at
  before update on public.patient_private_settings
  for each row execute function public.set_updated_at();

-- 6. Row Level Security — owner-only on all three tables ---------------------
alter table public.call_preferences enable row level security;
alter table public.medicine_call_settings enable row level security;
alter table public.patient_private_settings enable row level security;

drop policy if exists "Users can view their call preferences" on public.call_preferences;
create policy "Users can view their call preferences"
  on public.call_preferences for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their call preferences" on public.call_preferences;
create policy "Users can create their call preferences"
  on public.call_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their call preferences" on public.call_preferences;
create policy "Users can update their call preferences"
  on public.call_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their call preferences" on public.call_preferences;
create policy "Users can delete their call preferences"
  on public.call_preferences for delete
  using (user_id = auth.uid());

drop policy if exists "Users can view their medicine call settings" on public.medicine_call_settings;
create policy "Users can view their medicine call settings"
  on public.medicine_call_settings for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their medicine call settings" on public.medicine_call_settings;
create policy "Users can create their medicine call settings"
  on public.medicine_call_settings for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their medicine call settings" on public.medicine_call_settings;
create policy "Users can update their medicine call settings"
  on public.medicine_call_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their medicine call settings" on public.medicine_call_settings;
create policy "Users can delete their medicine call settings"
  on public.medicine_call_settings for delete
  using (user_id = auth.uid());

drop policy if exists "Users can view their private settings" on public.patient_private_settings;
create policy "Users can view their private settings"
  on public.patient_private_settings for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their private settings" on public.patient_private_settings;
create policy "Users can create their private settings"
  on public.patient_private_settings for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their private settings" on public.patient_private_settings;
create policy "Users can update their private settings"
  on public.patient_private_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their private settings" on public.patient_private_settings;
create policy "Users can delete their private settings"
  on public.patient_private_settings for delete
  using (user_id = auth.uid());
