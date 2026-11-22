# DoseSaathi — Supabase backend (migrations, Storage, Edge Functions)

SQL migrations, Storage bucket, and Edge Functions for the DoseSaathi
backend (Supabase Postgres + Auth + Storage + Functions). The app runs
in **demo mode** without these — no Supabase project is required to
explore the UI. Apply them only when you want real accounts, real data,
cross-device sync, medicine photos, and voice-call reminders.

## Deployment status — NOT YET DONE

- **No live Supabase project exists for DoseSaathi yet.** Nothing below
  has been applied anywhere.
- **Nothing is deployed:** no migrations applied, no Storage bucket
  created, no Edge Function deployed, no pg_cron job scheduled.
- **No real test call has been made** (no funded Twilio account yet).
  The first live call is step 6 of the deployment section below.
- Do **not** touch the existing SwasthyaSaathi project (a different
  app's project) — DoseSaathi needs its own new project.

## Applying the migrations

In the Supabase Dashboard for your project:

1. Open **SQL Editor → New query**.
2. Paste the contents of `migrations/001_profiles.sql` and click **Run**.
3. Repeat in order for `002_medications.sql`,
   `003_connections_and_notifications.sql`, `004_rls.sql`,
   `005_medication_images.sql`, `006_call_prefs.sql`,
   `007_call_attempts.sql`, and `008_flag_call_help.sql`.

Order matters: each file depends on the previous ones (profiles → health
tables → connections/helpers → RLS policies → photos → call prefs →
call attempts → help RPC). Every file is idempotent where practical
(`create table if not exists`, `drop policy if exists` before
`create policy`, `create or replace function`), so re-running a file is
safe.

Do **not** paste all eight files into one query and run them together
unless your editor runs them strictly in order — run them one at a time
and confirm each succeeds before moving on.

CLI alternative (project linked with
`supabase link --project-ref <ref>`): `supabase db push` applies the
files in `supabase/migrations/` in filename order, which is the same
001–008 order.

## What each file does

| File | Contents |
| --- | --- |
| `001_profiles.sql` | `user_role` enum, `profiles` table, `is_admin()` helper, `set_updated_at()` trigger function, signup trigger (role clamped to patient/caregiver), anti-privilege-escalation trigger, profile RLS policies |
| `002_medications.sql` | `medications`, `medication_schedules`, `dose_events` tables + indexes + `updated_at` triggers |
| `003_connections_and_notifications.sql` | `caregiver_connections`, `notification_preferences`, `notification_logs`, `healthcare_connections`, `follow_up_notes`, `audit_events` tables + `can_access_patient()` / `can_write_patient()` access helpers |
| `004_rls.sql` | `support_requests` table + RLS enabled on **all** tables with the full policy set |
| `005_medication_images.sql` | Private `medication-photos` Storage bucket + `medication_images` table; patient + active caregivers can read, patient can write/delete |
| `006_call_prefs.sql` | `call_preferences` (consent, phone, language/voice, quiet hours), `medicine_call_settings` (per-medicine opt-in), `patient_private_settings` (pregnancy flag + clinician instructions); owner-only RLS |
| `007_call_attempts.sql` | `call_attempts` + `call_responses` tables, `dose_events.source` + `call_attempt_id`; deliberately **no** client UPDATE policy on `call_attempts` (server + RPC only) |
| `008_flag_call_help.sql` | `flag_call_help(uuid)` RPC (`SECURITY DEFINER`, patient-only, idempotent): the only client path to mark a call's escalation `pending` |

## Deploying the voice-call Edge Functions

Prerequisites: a Supabase project with migrations 001–008 applied, a
funded Twilio account with a verified caller number, and the Supabase
CLI (`npm i -g supabase`) logged in (`supabase login`) and linked
(`supabase link --project-ref <ref>`).

1. **Secrets** (Dashboard → Edge Functions → Secrets, or
   `supabase secrets set`): `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (E.164, e.g.
   `+919999999999`). `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — never set
   them by hand, and never put the service-role key in the frontend.
2. **Deploy the functions** (from the repo root; function code lives
   in `supabase/functions/`):
   ```bash
   supabase functions deploy scan-due-calls
   supabase functions deploy trigger-call
   supabase functions deploy call-webhook --no-verify-jwt
   supabase functions deploy call-status --no-verify-jwt
   ```
   What each does: `scan-due-calls` finds due doses whose patient
   consented (and is outside quiet hours) and queues calls;
   `trigger-call` places them via Twilio; `call-webhook` serves the
   TwiML keypad/speech flow (Press 1 taken / 2 later / 3 help);
   `call-status` records Twilio delivery callbacks.

   **Why the flags differ (verify_jwt):** `scan-due-calls` is invoked
   by pg_cron with the service-role key and `trigger-call` is invoked
   by `scan-due-calls` with the service-role key, so both carry a
   valid JWT and keep the default `verify_jwt = true`.
   `call-webhook` and `call-status` are called by Twilio, which sends
   no JWT at all — they **must** be deployed with `--no-verify-jwt`,
   or Twilio's requests will be rejected with 401. (There is no
   `supabase/config.toml` in this repo; the equivalent persistent
   form is `[functions.call-webhook] verify_jwt = false` and
   `[functions.call-status] verify_jwt = false` in a `config.toml`.)

   > **Webhook authentication:** `call-webhook` and `call-status`
   > validate every request against Twilio's request signature
   > (`X-Twilio-Signature`: HMAC-SHA1 over the full URL + sorted POST
   > parameters, keyed by `TWILIO_AUTH_TOKEN` — see
   > `_shared/twilioSignature.ts`). Validation runs first, before any
   > database access; a missing or invalid signature — or a missing
   > `TWILIO_AUTH_TOKEN` — is a 403 with a generic body. Deploy
   > requirement: `TWILIO_AUTH_TOKEN` **must** be set as a function
   > secret (step 1) before the webhooks can accept anything; without
   > it every Twilio request is rejected. The `attempt_id` in the URL
   > is an identifier, never the authentication.
3. **Verify the Storage bucket:** migration 005 creates the private
   `medication-photos` bucket (public = false) plus its Storage
   policies — no manual bucket creation is needed. After applying the
   migrations, confirm in Dashboard → Storage that the bucket exists
   and is private, and that photos are served only through signed
   URLs (never public URLs).
4. **Schedule the scanner** with pg_cron — run `pg_cron.sql` once in
   the SQL Editor (after migrations 001–008), replacing the two
   placeholders `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`. It enables
   the `pg_cron` and `pg_net` extensions and creates the job
   `dose-saathi-scan-due-calls` on schedule `*/10 * * * *` (every 10
   minutes), POSTing to the `scan-due-calls` function URL with the
   service-role key. Verify with the queries at the bottom of
   `pg_cron.sql` (`select jobname, schedule, active from cron.job`,
   and `cron.job_run_details` for recent runs). The function is
   idempotent (one call attempt per schedule + date + attempt
   number), so a re-run never double-calls.
5. **Twilio webhook URLs:** in the Twilio console, point the number's
   voice webhook at your deployed `call-webhook` URL and the status
   callback at `call-status`. Both endpoints validate the Twilio
   request signature against `TWILIO_AUTH_TOKEN` (see step 2), so
   only genuine Twilio requests are accepted.
6. **Flip the frontend flag:** set `VITE_TWILIO_CONFIGURED=true` in
   the frontend environment (Vercel project settings or `.env`) and
   redeploy. Until then the app honestly shows "Voice calls are not
   configured".
7. **Test with one real call:** enable calls for a test patient (with
   consent), set a dose due in a few minutes, wait for the cron tick,
   answer the phone, and press 1 — the dose should appear as taken
   with source `call` in History, and the attempt in Call history.
   This step has **not** been run yet (no funded Twilio account) — it
   is the first thing to do after deployment.

**Safety rules the server enforces** (also unit-tested, 154 tests):
a dose is marked taken only from an explicit Press-1 / clear "taken"
speech answer — never from unanswered, voicemail, or ambiguous
responses; completed calls are never retried; no calls during quiet
hours; Press-3 help escalates immediately and is logged to
`audit_events`, while the caregiver alert itself still passes the
consent gate.

## Call language — the call speaks the patient's own language

Every automatic call resolves its language once per `call-webhook`
request, at call time, via `resolveCallLanguage` in
`supabase/functions/_shared/language.ts` (pure, unit-tested). The
precedence is:

1. **`call_preferences.language`** — the patient's explicit voice-call
   choice (migration 006 constrains it to `'en' | 'kn'`). Wins
   whenever the prefs row exists with a supported value.
2. **`profiles.preferred_language`** — the patient's own language
   (migration 001, default `'en'`), when it is a supported language
   (`'en' | 'kn'`). This is the path for a patient who never set an
   explicit call language.
3. **`'en'`** — explicit, logged last resort, reachable only when
   both stored values are missing or unsupported. The webhook logs a
   warning with the stored values so a bad row is visible.

The one resolved value drives every prompt, the `<Gather>` language
(`en-IN` / `kn-IN`), speech interpretation, and voice resolution
(Polly Aditi for English, Polly Kajal for Kannada) in that request,
so the language can never switch mid-call. Voice fallback never
switches languages either: an unavailable preferred voice falls back
to the same-language default. Neither the scanner nor `trigger-call`
stores a language on the attempt (`call_attempts` has no language
column; the TwiML URL carries only `attempt_id` and `step`), so
retries, Press-2 "remind me later" follow-ups, and queued triggers
all re-resolve the language fresh at webhook time — a patient who
changes their language between attempts gets the new language on the
next attempt.

Two narrow exceptions are unavoidably English: the `call-webhook`
error paths that answer "Thank you. Goodbye." before any patient is
known (missing/invalid config or unknown `attempt_id`) — there is no
patient yet to take a language from.

Kannada prompts and speech keywords are functional and **not
native-speaker reviewed** — they need a review pass before real
patients use them.

## Security model (summary)

- **Patients** manage their own medications, schedules, dose events,
  notification preferences, and connections.
- **Caregivers and healthcare professionals** can *read* a patient's
  rows only while an **active** connection exists — revoking the
  connection instantly revokes access. Caregivers **never** record
  doses for the patient.
- **Healthcare professionals** can add follow-up notes for patients
  they can access.
- **Admins have no access to private medication records.** Admin
  policies cover only profiles, audit events, and support requests.
- **Roles are never self-granted.** Signup metadata is clamped to
  `patient` / `caregiver`; `healthcare_professional` and `admin` are
  granted by an existing admin only, and a trigger blocks anyone else
  from changing `role`.

## Bootstrapping the first admin

1. Sign up through the app normally (as a patient or caregiver).
2. In the SQL Editor, run:
   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'you@example.com';
   ```
3. Sign out and sign in again.

## Demo mode

Without a Supabase project configured, the app uses its built-in demo
provider with local sample data. The TypeScript types in
`src/types/index.ts` mirror these tables, so the demo provider and the
Supabase provider share one interface.
