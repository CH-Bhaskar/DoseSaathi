# DoseSaathi — Intelligent Medication & Care Companion

DoseSaathi helps elderly people and people managing chronic conditions
(hypertension, diabetes) follow their **existing** medication schedules —
with clear reminders, a simple daily schedule, and a trusted caregiver who
is alerted only when a dose stays unconfirmed.

**DoseSaathi is a medication-adherence and care-coordination tool, not a
doctor or pharmacy.** It never diagnoses, recommends a medicine, invents a
dosage, or changes a prescription. If a possible schedule overlap or
duplicate is entered, it shows a neutral warning and asks the user to
confirm with a doctor or pharmacist. In an emergency, call 112.

**Extension (2026-11-22):** medicine photos (private Storage, optional
OCR that only *suggests* a name/strength for the user to check) and
scheduled voice-call reminders via Twilio (opt-in, quiet hours, keypad
confirmation — Press 1 taken / 2 later / 3 help — with consent-gated
caregiver escalation). See [How photos and calls work](#how-photos-and-calls-work)
and `EXTENSION_PLAN.md`. Until Twilio is configured, the app honestly
shows "Voice calls are not configured" and no call is ever faked; the
Call history screen is empty until real calls exist.

## Quick start (Supabase required)

DoseSaathi needs a Supabase project — there is no demo mode any more.
Without `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` the app shows an
honest not-configured state: the language screen and the login/signup
forms still render, but sign-in is unavailable and no data is shown.

```bash
npm install
cp .env.example .env   # fill in your project's URL + anon key
npm run dev
```

Open http://localhost:5173. See [Connect Supabase](#connect-supabase)
for creating the project and running the migrations. If the app shows
"Supabase is not configured", the `.env` values are missing or the dev
server was started before they were added — restart it.

### Open in VS Code

Unzip the project, then in VS Code choose **File → Open Folder** and pick
the extracted folder. The `.vscode/` folder is already set up:

- **Terminal → Run Task… → dev: start server** — starts the app on
  http://localhost:5173 (or run `npm run dev` in the integrated terminal).
- **Terminal → Run Task… → build / test: unit tests / test: Edge Function
  tests / test: walkthrough / lint** — the same commands CI would run.
- **Run and Debug → Debug in Chrome** — launches the dev server and
  attaches the debugger.
- VS Code will suggest the recommended extensions (Tailwind, oxlint,
  Playwright, Deno) when the folder opens.

## Walkthrough (2 minutes, needs a configured project)

1. Open the app, choose your language from the dropdown, and tap
   **Continue**.
2. Create an account (patient) and finish onboarding.
3. The dashboard shows today's progress, the next medicine, and a large
   **Mark as taken** action. Mark a dose taken — the progress bar and
   weekly summary update immediately.
4. **Medicines → Add a medicine**: fill in a medicine from a prescription,
   review it on the confirmation screen, and save. Add the same medicine
   twice to see the duplicate/same-time warning — saving stays blocked
   until you acknowledge it.
5. **Schedule** shows the day's doses in order; **History** shows what was
   taken, missed, or skipped; **Adherence** charts the week and exports a
   summary for your doctor.
6. Invite a caregiver from **Caregiver** and have them create an account:
   their dashboard shows missed-dose alerts and today's counts.
7. Switch language to **Kannada** from the header, and try **Profile →
   Larger text**.
8. Go offline (DevTools → Network → Offline), mark a dose, and watch the
   offline banner and pending-sync indicator; go back online and it syncs.
9. **Call history** (sidebar): once voice calls are configured, attempts
   show here — completed with keypad confirmation, no answer with a
   retry, help requested. Open a pending call's **View details** to
   confirm the dose, ask for a reminder, or request help — the same
   actions a real call offers.
10. **Reminders → Voice calls**: grant or revoke call consent, pick a
    language/voice and preview it, set quiet hours. Until Twilio is
    configured the page shows the not-configured notice; nothing is
    faked.

## Stack

React 19 + TypeScript (strict, zero `any`) + Vite + Tailwind CSS 4 +
React Router + Zustand + React Hook Form + Zod + Recharts + i18next
(English + Kannada) + Lucide icons. Backend: Supabase (Auth, PostgreSQL,
RLS, Storage, Edge Functions) — direct from the browser, plus Edge
Functions for the voice-call queue. Voice calls: Twilio (Voice API +
TwiML). Photo text reading: tesseract.js 7 (bundled locally, runs in the
browser). PWA with a service worker + IndexedDB offline outbox.

## Project structure

```
src/
  pages/        20 screens: landing, auth, language, onboarding,
                patient dashboard, medication add/edit/details, schedule,
                reminder settings, history, analytics, caregiver
                connection + dashboard, health-professional view,
                profile/accessibility, privacy/consent, help/safety,
                admin, call history, not-found
  components/   AppShell, Sidebar, MobileNavigation, MedicationCard,
                NextDoseCard, DoseStatusBadge, ProgressCard,
                ReminderDialog, CaregiverStatusCard, EmptyState,
                ErrorState, OfflineBanner, ConfirmDialog (+ DoseActions),
                MedicationPhotoUpload, MedicationPhotoPreview,
                VoiceReminderSettings, LanguageVoiceSelector,
                ConsentSettings, CallStatusCard, DoseConfirmationDialog,
                ProviderUnavailableNotice, AccessibleActionButton
  features/     (folded into pages/ + components/ — see note below)
  hooks/        useDoses (ticking clock, today's doses, due reminder)
  services/     DataProvider interface, supabaseProvider (Supabase),
                outbox (IndexedDB queue)
  store/        appStore (Zustand): session, snapshot, mutations,
                offline queue, 30s grace-escalation timer, sync state
  lib/          doseLogic (pure: schedules, live status, adherence,
                conflict rules), time, speech, notifications,
                supabase client, export, callHistory (pure
                call-history join), callPrefs, ocr, photoTransform
  validation/   Zod schemas (medication, profile, auth, invite, prefs,
                extension)
  types/        domain types mirroring the Supabase tables (+ calls)
  i18n/         en.json + kn.json (626 keys each, placeholders checked)
  *.test.ts     unit tests (Vitest)
supabase/
  migrations/   001 profiles, 002 medications, 003 connections &
                notifications, 004 RLS (47 policies, 11 tables),
                005 medication photos (private bucket + table),
                006 call preferences + consent + pregnancy setting,
                007 call attempts + responses, 008 flag_call_help RPC
  functions/    Edge Functions: scan-due-calls, trigger-call,
                call-webhook, call-status (+ _shared pure modules);
                pg_cron.sql documents the schedule
  README.md     deployment guide (migrations + bucket + functions +
                pg_cron)
tests/
  walkthrough.mjs  Playwright no-backend walkthrough (47 checks)
  screenshots/     screenshots from the last walkthrough run
                   (25–27 current; 01–24 are from the pre-removal demo
                   walkthrough and are kept as history)
  fixtures/        photo fixture for the upload walkthrough
```

Note: `features/` from the original plan is folded into `pages/` and
`components/` — each screen owns its feature code, and shared logic lives
in `lib/` + `store/`, which kept the tree flatter without duplicating
state.

## How it works

**Configuration.** `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. When either is missing, `isConfigured` is
false and the app shows a full-screen not-configured state naming the
two variables — no Supabase call is ever attempted, no fake login is
offered, and no sample data is shown. The language screen and the
login/signup forms still render, so the notice can be read in Kannada
and sign-in fails with an honest error instead of a crash.

**Data flow.** One `DataProvider` interface; the Zustand store talks
only to it. Every write goes through `writeOp`: apply optimistically
to the in-memory snapshot, write to the provider when online, and
queue in the IndexedDB outbox when offline or on failure.
Dose upserts are keyed on `(schedule_id, scheduled_date, scheduled_time)`
(a unique index in the database), and medication creates carry a
client-generated id — so replaying the queue can never create duplicates.

**Grace escalation.** Every 30 seconds (and on every refresh) the store
checks the signed-in patient's pending doses. A dose still unconfirmed
past the configured grace period (default 60 minutes) is marked missed,
and an in-app alert is logged for each active caregiver. Email/SMS are
never faked: with no channel configured, the log records them as
`unavailable` and the alert is in-app only.

**Access control.** Row Level Security enforces: patients
see only their own data; caregivers and health professionals see only
patients with an *active* connection to them; revoking a connection
removes access immediately; admins see profiles + support requests, never
medication records. Signup roles are clamped to patient/caregiver —
nobody self-registers as a health professional or admin (see
`001_profiles.sql`).

**Safety.** Conflict detection uses transparent rules over user-entered
data only (same name + strength, same name with a different strength,
same/nearby scheduled times). It never claims clinical safety. Missed-dose
screens show a neutral message: follow the prescription or contact a
doctor/pharmacist — never "double the dose".

## How photos and calls work

**Medicine photos.** While adding a medicine, the photo is held locally
and uploads only after the medicine saves; while editing, it uploads
immediately. Photos live in the private `medication-photos` Storage
bucket — the patient and their active caregivers can see them; nobody
else can. The editor offers rotate and a square/full crop, all
keyboard-operable. **Read text** runs OCR in the browser (tesseract.js,
bundled locally — the image never leaves the device for OCR) and only
*suggests* a name/strength, which the user checks before anything is
filled in; OCR text is never trusted on its own. The medicine name is
always shown beside its photo — a medicine is never identified from a
photo alone.

**Voice-call reminders.** Opt-in per patient: consent, phone number,
language/voice (EN/KN), quiet hours, and per-medicine call settings live
in `call_preferences` / `medicine_call_settings`. The server side is
Supabase Edge Functions: `scan-due-calls` (run by pg_cron) finds due
doses whose patient consented and queues calls; `trigger-call` places
them via Twilio; `call-webhook` handles keypad (Press 1 taken / 2 later /
3 help) and speech answers; `call-status` records delivery outcomes.
Rules the code enforces: a dose is marked taken only from an explicit
Press-1 / clear "taken" speech answer — never from unanswered, voicemail,
or ambiguous responses; completed calls are never retried; Press-3 help
escalates immediately and is logged to `audit_events` (the caregiver
alert itself still passes the consent gate); no calls during quiet hours.
The browser cannot detect the server-side Twilio setup, so
`VITE_TWILIO_CONFIGURED=true` is the explicit flag that hides the
not-configured notice — set it only after the Twilio secrets are in the
Supabase Dashboard and the functions are deployed. Call history
(`Call history` in the sidebar) shows attempts, responses, and the linked
dose outcome; pending calls offer the same confirm / remind-later /
need-help actions in-app. Dose events record `source` (`app` / `call` /
`caregiver`) and the `call_attempt_id` that confirmed them.

**Pregnancy setting.** On the Profile page, a private pregnancy flag with
a free-text field for clinician instructions. It changes no behaviour and
produces no recommendations — it is stored for the patient (and their
clinician) only, and is never shown to caregivers.

## Connect Supabase

1. Create a project at https://supabase.com/dashboard.
2. In the Supabase SQL Editor, run the migrations in order:
   `supabase/migrations/001_profiles.sql` → `002` → `003` → `004` →
   `005` → `006` → `007` → `008` (see `supabase/README.md` for the
   security summary, the Storage bucket, the Edge Functions + pg_cron
   deployment, and how to create the first admin).
3. Copy `.env.example` to `.env` and fill in your project's URL and
   **publishable (anon) key** from Project Settings → API. Never put the
   `service_role` key in the frontend — it bypasses RLS.
4. Restart the dev server. The not-configured state disappears; signups
   now create real Supabase Auth users.
5. For voice calls: set the `TWILIO_*` secrets in the Supabase Dashboard
   (Edge Functions → Secrets), deploy the functions (see
   `supabase/README.md`), then set `VITE_TWILIO_CONFIGURED=true` in the
   frontend env. Until then the app shows "Voice calls are not
   configured" — that is the honest state, not an error.

Email/SMS delivery is not configured: caregiver alerts are in-app only
until you add a notification channel (e.g. a Supabase Edge Function
calling your email/SMS provider). The app labels external delivery as
unavailable until then.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (http://localhost:5173) |
| `npm run build` | Strict TypeScript check + production build |
| `npm run preview` | Serve the production build (http://localhost:4173) |
| `npm test` | App unit tests (Vitest) — 105 tests |
| `npm run test:functions` | Edge Function unit tests (Vitest) — 141 tests |
| `npm run test:e2e` | Playwright no-backend walkthrough (47 checks) — run `npm run build` + a preview first (or point `E2E_BASE_URL` at a preview on another port) |

## Deploy (Vercel)

```bash
npm run build   # verify first
vercel          # or import the repo in the Vercel dashboard
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel
project's environment variables; without them the deployed site shows
the not-configured state and sign-in is unavailable. The frontend is a
static SPA (the service worker + manifest ship from `public/`); the
voice-call queue lives in Supabase Edge Functions, deployed separately
(see `supabase/README.md`).

## Verification

See [TEST_REPORT.md](TEST_REPORT.md): production build with zero errors,
105/105 app unit tests, 141/141 Edge Function unit tests, 47/47
Playwright no-backend walkthrough checks with 0 page errors, 29
screenshots (25–27 current), zero emoji in UI code, zero secrets in
code, zero `any`, 626/626 i18n keys.

## Known gaps (honest list)

- **No live Supabase project exists yet** — until one is created and
  wired (the free plan is at its 2-project limit; see
  `EXTENSION_PLAN.md`), the app shows the not-configured state and
  sign-in is unavailable. Migrations, RLS, and Edge Functions are
  verified by tests + SQL parsing only, not against a live project,
  and the authenticated flows (dashboard, medications, calls, photos)
  are NOT TESTED against the current build — they were last verified
  end to end in the pre-removal demo build, which no longer exists.
- A real voice-call reminder has **not been tested end to end** — no
  funded Twilio account exists yet. The call flow (queue, TwiML, keypad,
  escalation) is unit-tested (141 tests), but no phone has rung.
- The in-app grace-escalation timer still runs in the patient's browser:
  a missed dose is only escalated while the app is open (or on the next
  visit). The server-side call queue (Edge Function + pg_cron) covers
  voice reminders once deployed; the in-app missed-dose alert keeps the
  browser limitation.
- Browser notifications need permission and may not arrive if the browser
  is fully closed — this is stated in Reminder settings.
- Kannada translations and voice prompts were written for this build and
  have **not** been reviewed by a native speaker — get a review pass
  before real patients use them.
- Voice (Listen) uses the browser's speech synthesis where available,
  with a text fallback; it was not verified audibly in headless Chromium.
  Screen-reader behaviour was verified via accessibility-tree snapshots
  (roles/names), not with a real screen reader.
- The Playwright walkthrough needs the `playwright` 1.55 browser
  (chromium-1193). If it is not in your cache, run
  `npx playwright install chromium` (network access required).
