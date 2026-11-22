# DoseSaathi Extension — Inspection Report (2026-11-22)

Pre-coding report for the voice-call + medicine-photo + accessibility extension.
Inspected the repository as it stands; nothing was changed in this pass.

> **Update (2026-11-22, after the build): demo mode was removed.** The
> demo provider, demo seed, and demo photo blobs are deleted; the app
> now requires a Supabase project and shows an honest not-configured
> state without one. References to demo mode below describe the state
> at inspection/build time and are kept as history. **No live Supabase
> project exists yet** — the free plan is at its 2-project limit, so
> migrations/bucket/functions remain verified locally only; nothing in
> this document claims a project exists.

## Existing project

- **Stack:** React 19 + TypeScript (strict, 0 `any`) + Vite 8 + Tailwind CSS 4 +
  React Router 7 + Zustand + React Hook Form + Zod + Recharts + i18next
  (English + Kannada, 478 keys, 0 missing) + Lucide icons. 57 TS/TSX files.
- **Architecture:** Supabase-direct from the browser — **no custom server, no
  Edge Functions, no scheduled job**. Provider pattern:
  `src/services/provider.ts` interface with `supabaseProvider.ts` (live) and
  `demoProvider.ts` (localStorage demo) + `src/services/outbox.ts` (IndexedDB
  offline outbox). PWA with `public/sw.js` + manifest.
- **Database:** `supabase/migrations/` 001–004, 11 tables
  (profiles, medications, medication_schedules, dose_events,
  caregiver_connections, notification_preferences, notification_logs,
  healthcare_connections, follow_up_notes, audit_events, support_requests),
  47 RLS policies, RLS on all tables. **No Storage bucket. No live Supabase
  project wired** — the app runs in clearly labelled demo mode unless
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set.
- **Verified state:** production build clean (strict `tsc -b`), unit tests
  43/43, Playwright walkthrough 39/39 with 0 page errors (see TEST_REPORT.md).
  Live web version exists as an artifact; `vite preview` serves :4173.

## What already works (the extension builds on this)

- **Medication CRUD** with a review-before-save step and duplicate /
  same-time warnings (`MedicationFormPage`, `MedicationDetailsPage`,
  `MedicationCard`, `MedicationListPage`; `validation/medication.ts`).
- **Dose tracking** with a grace window (`lib/doseLogic.ts`: liveStatus,
  countdowns, snooze), dose history, 7-day adherence, analytics + doctor
  export (`lib/export.ts`).
- **In-app reminders:** `ReminderSettingsPage` + `notification_preferences`
  (grace_period_minutes, browser_notifications, in_app_alerts,
  caregiver_alerts_enabled, include_med_details, reminder_minutes_before),
  `notification_logs`, `ReminderDialog`. Escalation only fires while the app
  is open (known gap — no server-side job).
- **Caregiver consent:** `caregiver_connections` with invite / accept /
  revoke; alerts only on unconfirmed doses. Healthcare connections +
  follow-up notes exist too.
- **Languages + voice:** EN + Kannada dictionaries; `lib/speech.ts` TTS
  (en-IN / kn-IN, rate 0.9, honest fallback when unsupported).
- **Accessibility (partial):** large-text mode, high-contrast mode,
  reduced-motion query in `index.css`, Profile → Larger text. Keyboard /
  screen-reader coverage has NOT been systematically tested.
- **Audit trail:** `audit_events` table exists.

## What does not exist yet (this brief fills it)

- **Medicine photos:** no Storage bucket, no upload/display/crop/OCR code
  anywhere. No image handling at all.
- **Voice calls:** zero telephony code — no Twilio, no call queue, no
  keypad/DTMF handling, no call history, no call fields in
  `notification_preferences`.
- **Server side:** nothing to run a scheduled job. A call queue needs a new
  server component (see decision 1).
- **Pregnancy setting:** no mention anywhere in code or migrations.
- **Voice-call consent:** caregiver consent exists for alerts, not for
  phone calls or call escalation.

## Files that will change (by implementation stage)

1. **Photos** — NEW `supabase/migrations/005_medication_images.sql`
   (private bucket + image metadata table + RLS); NEW components
   `MedicationPhotoUpload`, `MedicationPhotoPreview`; `MedicationFormPage`,
   `MedicationDetailsPage`, `MedicationCard`, `MedicationListPage` (search
   with photos); `services/provider.ts` + both providers (upload/get/delete);
   `types/index.ts`; i18n keys (en + kn); tests.
2. **Preferences / language / consent** — NEW migration `006_call_prefs.sql`
   (call preferences, consent state, language/voice, pregnancy flag on
   profiles); `ReminderSettingsPage` + NEW `VoiceReminderSettings`,
   `LanguageVoiceSelector`, `ConsentSettings`; `ProfilePage` (pregnancy
   setting, private); provider methods; i18n.
3. **Server call queue** — NEW `supabase/functions/` (Edge Functions:
   due-dose scanner, Twilio call trigger, TwiML keypad handler, status
   callback) + scheduled invocation (pg_cron); NEW migration
   `007_call_attempts.sql` (call attempts, responses, idempotency keys,
   retry state); `.env.example` (TWILIO_*); deployment docs.
4. **Keypad confirmation** — TwiML flow (Press 1 taken / 2 later / 3 help)
   writing to `dose_events` with a `source` marker; NEW `CallStatusCard`,
   `DoseConfirmationDialog`; History page (call-linked confirmations).
5. **Speech responses** — Twilio `<Gather>` speech input + EN/KN TTS prompts;
   voice preview in `LanguageVoiceSelector`.
6. **Caregiver escalation** — reuse `caregiver_connections` consent +
   escalation delay; `notification_logs` entries; consent-gated.
7. **Accessibility** — NEW `AccessibleActionButton`; aria-live
   announcements; focus management; keyboard + screen-reader test pass;
   extend existing large-text / high-contrast modes.
8. **Logs / docs** — `audit_events` entries for consent + setting changes;
   README + TEST_REPORT updates; `ProviderUnavailableNotice` for
   unconfigured-provider and offline states.

## Decisions and blockers (flagged before coding)

1. **Server side:** recommend **Supabase Edge Functions + pg_cron** — fits
   the Supabase-direct architecture, no new server to host or deploy.
   (Alternative: a small Express service like SwasthyaSaathi's `backend/`.)
2. **Twilio is not configured and no funded account exists** (same position
   as SwasthyaSaathi). The full integration + sandbox path will be built and
   the app will honestly show "Voice calls are not configured" until then.
   Acceptance criterion "a test call can be completed" stays NOT TESTED
   until the user funds Twilio and verifies a number.
3. **No live Supabase project is wired for DoseSaathi.** New migrations,
   the Storage bucket, and Edge Functions will be built and verified
   locally (SQL parsed, functions tested) + in demo mode; applying them
   live needs a Supabase project decision (the user's free plan is at its
   2-project limit).
4. **Kannada prompts need native/qualified review before release.** The
   builder cannot native-review Kannada — that step needs the user or a
   reviewer.
5. **Demo mode (superseded — removed 2026-11-22):** at build time, new
   features had to degrade honestly in demo mode (photos via local
   blobs; calls show the not-configured notice; nothing faked). Demo
   mode no longer exists; without Supabase configured the app shows
   the not-configured state instead.

---

# Outcomes (build complete 2026-11-22, all 8 stages)

Verified numbers: production build clean; app unit tests 97/97;
Edge Function unit tests 141/141; Playwright walkthrough 100/100 with
0 page errors; i18n 644/644 EN/KN. See TEST_REPORT.md. (These are the
build-time numbers; current numbers after the demo-mode removal are
105/105 unit tests, 47/47 no-backend walkthrough checks, 626/626
i18n keys — see TEST_REPORT.md.)

1. **Photos — done.** Migration 005 (private `medication-photos`
   bucket + `medication_images` table, RLS via `is_caregiver_for()`
   with real status `active`); `MedicationPhotoUpload` /
   `MedicationPhotoPreview` (rotate, preset crop, retake/remove,
   tesseract.js 7 OCR with locally bundled assets, suggestion-only);
   wired into `MedicationFormPage` (pending photo held until save),
   `MedicationDetailsPage`, `MedicationCard` (thumbnail beside the
   name). The provider implements upload/get/delete against the
   private Storage bucket. (At build time demo mode used local blobs;
   demo mode was removed 2026-11-22.)
2. **Preferences / language / consent — done.** Migration 006
   (`call_preferences`, `medicine_call_settings`,
   `patient_private_settings`, owner-only RLS); `VoiceReminderSettings`,
   `LanguageVoiceSelector` (EN/KN voice preview), `ConsentSettings`
   (separate consent for calls and for call escalation); pregnancy
   section on `ProfilePage` (private flag + clinician-instructions
   text, no behaviour change, never shown to caregivers). Zod schemas
   in `src/validation/extension.ts`.
3. **Server call queue — done (code + tests; not deployed).** Edge
   Functions `scan-due-calls`, `trigger-call`, `call-webhook`,
   `call-status` + `_shared/` pure modules; migration 007
   (`call_attempts`, `call_responses`, `dose_events.source` +
   `call_attempt_id`); `pg_cron.sql` documents the schedule;
   `.env.example` has the `TWILIO_*` server secrets. 141/141 function
   unit tests. Not deployed — no live Supabase project is wired yet.
4. **Keypad confirmation — done.** TwiML flow (Press 1 taken / 2 later
   / 3 help) writes `dose_events` with `source: 'call'` and the
   `call_attempt_id`; `CallStatusCard` + `DoseConfirmationDialog`
   (focus trap, Escape, aria-live) wired to `/calls` via
   `CallHistoryContainer`; at build time the demo seed included 5
   sample calls covering completed/keypad-1, no-answer/retry, keypad-3
   help, and 2 pending — the seed was deleted with demo mode
   (2026-11-22), so call history is now empty until real calls exist.
   A dose is never marked taken from unanswered/voicemail/ambiguous.
5. **Speech responses — done (code + tests; voice not heard).**
   `<Gather>` speech input with EN/KN TTS prompts in `call-webhook`;
   voice preview in `LanguageVoiceSelector`. Speech recognition
   accuracy and TTS audio were not verified — headless Chromium has no
   audio, and no real call has been placed.
6. **Caregiver escalation — done.** Press-3 help escalates immediately
   (delay bypassed) and logs to `audit_events`, not
   `notification_logs`, so the consent gate still guards the actual
   alert; in-app `flagCallHelp` goes through the new migration 008 RPC
   (`SECURITY DEFINER`, patient-only, idempotent) because 007
   deliberately has no client UPDATE policy on `call_attempts`.
7. **Accessibility — done.** New `AccessibleActionButton` (≥44px,
   visible focus, keyboard-native, aria-label support) used for the
   primary actions in all new flows; audit + fixes on the new
   components (labels, tab order, visible focus, `role="status"` /
   `aria-live` announcements for photo/consent/call changes, alt text,
   name always beside photo, keyboard-operable crop/rotate);
   large-text / high-contrast / reduced-motion extended to the new UI
   (badges get borders, amber notice goes white with a black border
   under high contrast); keyboard-only walkthrough (phase 16b) +
   accessibility-tree assertions. Known limits: no skip link yet
   (would need a new i18n key pair — follow-up); focus goes to body
   after remind-later closes the dialog (list re-renders during
   reload); the old `MedicationCard` Edit/Pause buttons are still
   40px (out of scope for this stage).
8. **Logs / docs — done.** `audit_events` entries for consent flips
   (`consent_calls_granted/revoked`,
   `consent_escalation_granted/revoked`), reminder-setting changes,
   and call help requests; README + TEST_REPORT + this plan updated;
   `supabase/README.md` gained the step-by-step deployment guide;
   `ProviderUnavailableNotice` wired into call history and the voice
   settings area; `npm run test:functions` added; zip re-packed.

**Decisions confirmed during the build:** caregiver status is `active`
(not `accepted`); `callsConfigured` is an explicit
`VITE_TWILIO_CONFIGURED` flag because the browser cannot detect
server-side Twilio secrets; call-history joining lives in one shared
pure module (`src/lib/callHistory.ts`) so entries are built in exactly
one place; the confirm dialog awaits async callbacks before showing a
result, so a failed save is never reported as success.

**Still open (honest gaps):** real test call NOT TESTED (no funded
Twilio); no live Supabase project wired (free plan at 2-project limit)
so migrations/bucket/functions are verified locally only and the
authenticated in-app flows are NOT TESTED against the current build
(demo mode, which they were last verified against, was removed
2026-11-22); Kannada not native-speaker reviewed; no real screen reader used;
`PatientDetailPage` photos out of scope.
