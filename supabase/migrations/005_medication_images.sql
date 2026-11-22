-- ============================================================================
-- DoseSaathi — 005: private medicine photos (Storage bucket + metadata)
-- ============================================================================
-- Apply AFTER 004_rls.sql, in the Supabase Dashboard → SQL Editor
-- (paste the whole file and click Run). Idempotent where practical:
-- re-running it is safe.
--
-- DATA MODEL
-- ----------
-- * The `medication-photos` Storage bucket is PRIVATE (public = false).
--   Photos are never served through public URLs: clients download them
--   through signed URLs (createSignedUrl) that expire.
-- * `medication_images` holds one metadata row per photo. The storage
--   path follows the convention `<patient_id>/<image_id>.<ext>` so the
--   Storage policies can resolve the owning patient from the path alone.
-- * `ocr_text` holds text read from the photo by on-device OCR. It is a
--   SUGGESTION ONLY: the app never infers a dosage, schedule, or
--   instruction from it. `ocr_confirmed` records that the user checked
--   the extracted text against their prescription.
--
-- ACCESS
-- ------
-- * The patient has full access to their own rows and objects.
-- * A caregiver with an ACTIVE connection (status = 'active', the value
--   this codebase uses for an accepted invitation) may SELECT the
--   patient's photos — read-only, mirroring medications in 004. Revoking
--   the connection instantly revokes access (is_caregiver_for()).
-- * Healthcare professionals do NOT get photo access: photos are
--   personal prescription images, and the extension brief grants photo
--   viewing to caregivers only.
-- * Admins have NO access to medication photos (same rule as 004).
-- ============================================================================

-- 1. Private Storage bucket --------------------------------------------------
insert into storage.buckets (id, name, public)
values ('medication-photos', 'medication-photos', false)
on conflict (id) do nothing;

-- 2. Metadata table ----------------------------------------------------------
create table if not exists public.medication_images (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  ocr_text text,
  ocr_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists medication_images_medication_id_idx
  on public.medication_images (medication_id);
create index if not exists medication_images_patient_id_idx
  on public.medication_images (patient_id);

-- 3. RLS on the metadata table ----------------------------------------------
alter table public.medication_images enable row level security;

-- The patient and their ACTIVE caregivers can view photo metadata.
drop policy if exists "Patients and caregivers can view medication images" on public.medication_images;
create policy "Patients and caregivers can view medication images"
  on public.medication_images for select
  using (
    patient_id = auth.uid()
    or public.is_caregiver_for(patient_id)
  );

-- Only the patient can add, change, or remove their photos.
drop policy if exists "Patients can add their medication images" on public.medication_images;
create policy "Patients can add their medication images"
  on public.medication_images for insert
  with check (public.can_write_patient(patient_id));

drop policy if exists "Patients can update their medication images" on public.medication_images;
create policy "Patients can update their medication images"
  on public.medication_images for update
  using (public.can_write_patient(patient_id))
  with check (public.can_write_patient(patient_id));

drop policy if exists "Patients can delete their medication images" on public.medication_images;
create policy "Patients can delete their medication images"
  on public.medication_images for delete
  using (public.can_write_patient(patient_id));

-- 4. Storage policies on storage.objects -------------------------------------
-- Paths are `<patient_id>/<image_id>.<ext>`; the first folder segment is
-- the owning patient's id. The uuid-shape guard keeps a malformed path
-- from failing the policy with a cast error (it simply matches nothing).
drop policy if exists "Patients and caregivers can view medication photos" on storage.objects;
create policy "Patients and caregivers can view medication photos"
  on storage.objects for select
  using (
    bucket_id = 'medication-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_caregiver_for(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "Patients can upload their medication photos" on storage.objects;
create policy "Patients can upload their medication photos"
  on storage.objects for insert
  with check (
    bucket_id = 'medication-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Patients can replace their medication photos" on storage.objects;
create policy "Patients can replace their medication photos"
  on storage.objects for update
  using (
    bucket_id = 'medication-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'medication-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Patients can delete their medication photos" on storage.objects;
create policy "Patients can delete their medication photos"
  on storage.objects for delete
  using (
    bucket_id = 'medication-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
