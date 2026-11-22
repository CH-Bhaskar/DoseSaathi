-- ============================================================================
-- DoseSaathi — 004: Row Level Security for every table
-- ============================================================================
-- Apply AFTER 003_connections_and_notifications.sql, in the Supabase
-- Dashboard → SQL Editor (paste the whole file and click Run). Idempotent
-- where practical: re-running it is safe (every policy is dropped before
-- it is recreated).
--
-- SECURITY MODEL
-- --------------
-- * Patients manage their own rows: medications, medication_schedules,
--   dose_events, notification_preferences, caregiver_connections,
--   healthcare_connections, and follow_up_notes about them (read).
-- * Caregivers and healthcare professionals can SELECT a patient's rows
--   ONLY through can_access_patient() — i.e. only while an ACTIVE
--   connection exists. Revoking the connection instantly revokes access.
-- * Caregivers NEVER record doses for the patient: there is no caregiver
--   write policy on dose_events (or on any other health table).
-- * Healthcare professionals can INSERT follow_up_notes for patients they
--   can access, and update/delete only notes they authored.
-- * Connections: the patient invites (insert, status forced to 'pending'),
--   manages (update incl. revoke), and removes (delete) their own
--   connections. The invitee claims the invitation by email, then accepts
--   it (pending → active). Nobody can self-approve: the accept policy
--   only allows the pending → active transition for the invitee.
-- * notification_logs: patients may INSERT logs for their own patient_id
--   only (the app's client-side escalation logs the in-app alerts it
--   raises); there is deliberately NO client update/delete policy — logs
--   are append-only. Patients read their own logs; recipients read logs
--   addressed to them.
-- * audit_events is append-only for clients: insert own actions only,
--   select own only, no update/delete. Admins can read all audit events.
-- * ADMINS have NO access to private medication records. Admin policies
--   exist ONLY on profiles (read/update/delete all, from 001), audit_events
--   (read all), and support_requests (read/update all). There is no admin
--   policy on medications, medication_schedules, dose_events,
--   notification_preferences, notification_logs, connections, or
--   follow_up_notes.
-- * The backend (service_role) bypasses RLS entirely, so backend code
--   MUST repeat these checks before writing on a user's behalf.
-- ============================================================================

-- 0. Support requests --------------------------------------------------------
-- Small support-desk table: the one place admins may read user-submitted
-- content (a subject + message the user chose to send to support).
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_user_id_idx
  on public.support_requests (user_id);

drop trigger if exists set_updated_at on public.support_requests;
create trigger set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

-- 1. Enable RLS on ALL tables ------------------------------------------------
alter table public.profiles enable row level security;
alter table public.medications enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.dose_events enable row level security;
alter table public.caregiver_connections enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_logs enable row level security;
alter table public.healthcare_connections enable row level security;
alter table public.follow_up_notes enable row level security;
alter table public.audit_events enable row level security;
alter table public.support_requests enable row level security;

-- 2. profiles ----------------------------------------------------------------
-- (Own-profile + admin policies live in 001; this adds the care-team read.)
-- A caregiver / healthcare professional with an ACTIVE connection can see
-- the patient's profile (name, preferred language) so their UI can show
-- who the patient is. No other profile access is granted here.
drop policy if exists "Care team can view patient profiles" on public.profiles;
create policy "Care team can view patient profiles"
  on public.profiles for select
  using (public.can_access_patient(id));

-- 3. medications -------------------------------------------------------------
drop policy if exists "Patients and care team can view medications" on public.medications;
create policy "Patients and care team can view medications"
  on public.medications for select
  using (public.can_access_patient(patient_id));

drop policy if exists "Patients can add their medications" on public.medications;
create policy "Patients can add their medications"
  on public.medications for insert
  with check (public.can_write_patient(patient_id));

drop policy if exists "Patients can update their medications" on public.medications;
create policy "Patients can update their medications"
  on public.medications for update
  using (public.can_write_patient(patient_id))
  with check (public.can_write_patient(patient_id));

drop policy if exists "Patients can delete their medications" on public.medications;
create policy "Patients can delete their medications"
  on public.medications for delete
  using (public.can_write_patient(patient_id));

-- 4. medication_schedules ----------------------------------------------------
-- Scoped through medication_id → medications.patient_id.
drop policy if exists "Patients and care team can view medication schedules" on public.medication_schedules;
create policy "Patients and care team can view medication schedules"
  on public.medication_schedules for select
  using (public.can_access_patient(public.medication_patient_id(medication_id)));

drop policy if exists "Patients can add their medication schedules" on public.medication_schedules;
create policy "Patients can add their medication schedules"
  on public.medication_schedules for insert
  with check (public.can_write_patient(public.medication_patient_id(medication_id)));

drop policy if exists "Patients can update their medication schedules" on public.medication_schedules;
create policy "Patients can update their medication schedules"
  on public.medication_schedules for update
  using (public.can_write_patient(public.medication_patient_id(medication_id)))
  with check (public.can_write_patient(public.medication_patient_id(medication_id)));

drop policy if exists "Patients can delete their medication schedules" on public.medication_schedules;
create policy "Patients can delete their medication schedules"
  on public.medication_schedules for delete
  using (public.can_write_patient(public.medication_patient_id(medication_id)));

-- 5. dose_events -------------------------------------------------------------
-- NOTE: caregivers NEVER record doses — there is intentionally no
-- caregiver write policy here. Only the patient (or backend service_role)
-- creates and updates dose events.
drop policy if exists "Patients and care team can view dose events" on public.dose_events;
create policy "Patients and care team can view dose events"
  on public.dose_events for select
  using (public.can_access_patient(patient_id));

drop policy if exists "Patients can add their dose events" on public.dose_events;
create policy "Patients can add their dose events"
  on public.dose_events for insert
  with check (public.can_write_patient(patient_id));

drop policy if exists "Patients can update their dose events" on public.dose_events;
create policy "Patients can update their dose events"
  on public.dose_events for update
  using (public.can_write_patient(patient_id))
  with check (public.can_write_patient(patient_id));

drop policy if exists "Patients can delete their dose events" on public.dose_events;
create policy "Patients can delete their dose events"
  on public.dose_events for delete
  using (public.can_write_patient(patient_id));

-- 6. caregiver_connections ---------------------------------------------------
-- The invitee is matched by caregiver_id once claimed, or by invited_email
-- against the email in their JWT before they have claimed the invitation.
drop policy if exists "Patients and invitees can view caregiver connections" on public.caregiver_connections;
create policy "Patients and invitees can view caregiver connections"
  on public.caregiver_connections for select
  using (
    patient_id = auth.uid()
    or caregiver_id = auth.uid()
    or invited_email = coalesce(auth.jwt() ->> 'email', '')
  );

-- status is forced to 'pending': an invitation starts pending and only the
-- invitee can activate it (see the accept policy below).
drop policy if exists "Patients can invite caregivers" on public.caregiver_connections;
create policy "Patients can invite caregivers"
  on public.caregiver_connections for insert
  with check (patient_id = auth.uid() and status = 'pending');

-- The patient manages the connection: revoke by setting status='revoked',
-- or change the invited email while it is still pending.
drop policy if exists "Patients can manage their caregiver connections" on public.caregiver_connections;
create policy "Patients can manage their caregiver connections"
  on public.caregiver_connections for update
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- Claim: the invited user (matched by email, before any caregiver_id is
-- set) links the invitation to their own account.
drop policy if exists "Invitees can claim their caregiver invitation" on public.caregiver_connections;
create policy "Invitees can claim their caregiver invitation"
  on public.caregiver_connections for update
  using (
    caregiver_id is null
    and invited_email = coalesce(auth.jwt() ->> 'email', '')
    and status = 'pending'
  )
  with check (caregiver_id = auth.uid() and status in ('pending', 'active'));

-- Accept: the claimed caregiver moves the invitation pending → active.
drop policy if exists "Caregivers can accept an invitation" on public.caregiver_connections;
create policy "Caregivers can accept an invitation"
  on public.caregiver_connections for update
  using (caregiver_id = auth.uid() and status = 'pending')
  with check (caregiver_id = auth.uid() and status = 'active');

drop policy if exists "Patients can remove caregiver connections" on public.caregiver_connections;
create policy "Patients can remove caregiver connections"
  on public.caregiver_connections for delete
  using (patient_id = auth.uid());

-- 7. notification_preferences ------------------------------------------------
drop policy if exists "Users can view their notification preferences" on public.notification_preferences;
create policy "Users can view their notification preferences"
  on public.notification_preferences for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their notification preferences" on public.notification_preferences;
create policy "Users can create their notification preferences"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their notification preferences" on public.notification_preferences;
create policy "Users can update their notification preferences"
  on public.notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their notification preferences" on public.notification_preferences;
create policy "Users can delete their notification preferences"
  on public.notification_preferences for delete
  using (user_id = auth.uid());

-- 8. notification_logs -------------------------------------------------------
-- NOTE: patients may INSERT logs for their own patient_id only. The app's
-- escalation runs in the patient's browser and must log the in-app alert
-- it raises; it cannot log for other patients, and there is deliberately
-- NO update/delete policy for clients — logs are append-only. A future
-- server-side escalation job (Edge Function / pg_cron) would write with
-- service_role, which bypasses RLS entirely.
drop policy if exists "Patients can log their own notifications" on public.notification_logs;
create policy "Patients can log their own notifications"
  on public.notification_logs for insert
  with check (patient_id = auth.uid());

drop policy if exists "Patients can view their own notification logs" on public.notification_logs;
create policy "Patients can view their own notification logs"
  on public.notification_logs for select
  using (patient_id = auth.uid());

drop policy if exists "Recipients can view notifications addressed to them" on public.notification_logs;
create policy "Recipients can view notifications addressed to them"
  on public.notification_logs for select
  using (
    recipient_id = auth.uid()
    or recipient_email = coalesce(auth.jwt() ->> 'email', '')
  );

-- 9. healthcare_connections --------------------------------------------------
-- Same shape as caregiver_connections, for healthcare professionals.
drop policy if exists "Patients and invitees can view healthcare connections" on public.healthcare_connections;
create policy "Patients and invitees can view healthcare connections"
  on public.healthcare_connections for select
  using (
    patient_id = auth.uid()
    or professional_id = auth.uid()
    or invited_email = coalesce(auth.jwt() ->> 'email', '')
  );

drop policy if exists "Patients can invite healthcare professionals" on public.healthcare_connections;
create policy "Patients can invite healthcare professionals"
  on public.healthcare_connections for insert
  with check (patient_id = auth.uid() and status = 'pending');

drop policy if exists "Patients can manage their healthcare connections" on public.healthcare_connections;
create policy "Patients can manage their healthcare connections"
  on public.healthcare_connections for update
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

drop policy if exists "Invitees can claim their healthcare invitation" on public.healthcare_connections;
create policy "Invitees can claim their healthcare invitation"
  on public.healthcare_connections for update
  using (
    professional_id is null
    and invited_email = coalesce(auth.jwt() ->> 'email', '')
    and status = 'pending'
  )
  with check (professional_id = auth.uid() and status in ('pending', 'active'));

drop policy if exists "Healthcare professionals can accept an invitation" on public.healthcare_connections;
create policy "Healthcare professionals can accept an invitation"
  on public.healthcare_connections for update
  using (professional_id = auth.uid() and status = 'pending')
  with check (professional_id = auth.uid() and status = 'active');

drop policy if exists "Patients can remove healthcare connections" on public.healthcare_connections;
create policy "Patients can remove healthcare connections"
  on public.healthcare_connections for delete
  using (patient_id = auth.uid());

-- 10. follow_up_notes --------------------------------------------------------
drop policy if exists "Patients and care team can view follow-up notes" on public.follow_up_notes;
create policy "Patients and care team can view follow-up notes"
  on public.follow_up_notes for select
  using (public.can_access_patient(patient_id));

-- The one care-team write: a healthcare professional with an ACTIVE
-- connection can add a note for that patient. Caregivers cannot.
drop policy if exists "Healthcare professionals can add follow-up notes" on public.follow_up_notes;
create policy "Healthcare professionals can add follow-up notes"
  on public.follow_up_notes for insert
  with check (author_id = auth.uid() and public.is_professional_for(patient_id));

drop policy if exists "Authors can update their own follow-up notes" on public.follow_up_notes;
create policy "Authors can update their own follow-up notes"
  on public.follow_up_notes for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "Authors can delete their own follow-up notes" on public.follow_up_notes;
create policy "Authors can delete their own follow-up notes"
  on public.follow_up_notes for delete
  using (author_id = auth.uid());

-- 11. audit_events -----------------------------------------------------------
-- Append-only for clients: insert own actions, read own rows. No
-- update/delete policy for anyone except the service_role backend.
drop policy if exists "Users can log their own actions" on public.audit_events;
create policy "Users can log their own actions"
  on public.audit_events for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own audit events" on public.audit_events;
create policy "Users can view their own audit events"
  on public.audit_events for select
  using (user_id = auth.uid());

drop policy if exists "Admins can view all audit events" on public.audit_events;
create policy "Admins can view all audit events"
  on public.audit_events for select
  using (public.is_admin());

-- 12. support_requests -------------------------------------------------------
drop policy if exists "Users can submit support requests" on public.support_requests;
create policy "Users can submit support requests"
  on public.support_requests for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can view their own support requests" on public.support_requests;
create policy "Users can view their own support requests"
  on public.support_requests for select
  using (user_id = auth.uid());

drop policy if exists "Admins can view all support requests" on public.support_requests;
create policy "Admins can view all support requests"
  on public.support_requests for select
  using (public.is_admin());

drop policy if exists "Admins can update support requests" on public.support_requests;
create policy "Admins can update support requests"
  on public.support_requests for update
  using (public.is_admin())
  with check (public.is_admin());
