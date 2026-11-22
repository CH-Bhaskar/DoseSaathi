# DoseSaathi — Test Report

Verified 2026-11-22 (IST) against the production build served by
`vite preview` on http://127.0.0.1:4175. Covers the base app plus the
voice-call + medicine-photo + accessibility extension (all 8 stages),
after demo mode was removed (see below).

## Demo mode removal (2026-11-22)

Demo mode is gone: `src/services/demoProvider.ts`,
`src/lib/demoSeed.ts`, and `src/services/photoBlobs.ts` (demo photo
blobs) are deleted; the provider is always `supabaseProvider`, and
`isConfigured` (both Supabase env vars set) replaces `isDemoMode`.
When Supabase is not configured, every provider method throws
`supabase.notConfigured` through a central guard — never a crash,
never fake data — and the app shows a full-screen not-configured
state naming `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and
pointing at `.env.example` and the README setup steps. The language
screen and login/signup forms still render unconfigured (with a
language dropdown on each); submitting sign-in or sign-up shows an
honest inline error and never creates a session. The 5 seeded sample
calls are gone with the seed — call history comes from Supabase only
and is empty until real calls exist. The language screen now uses one
`<select>` dropdown (EN/KN) + Continue instead of two big buttons;
the same dropdown is on the login/signup page. Also fixed in this
pass: `defaultCallPreferences` hard-coded the call language to `'en'`
— it now defaults to the patient's profile preferred language, then
the app language, then `'en'` only as a last resort (bug 13 below).

## Summary

| Suite | Result |
| --- | --- |
| Production build (`npm run build`, strict `tsc -b` + Vite) | Clean, 0 errors |
| App unit tests (`npm test`, Vitest, 8 files) | **105 / 105 passed** |
| Edge Function unit tests (`npm run test:functions`, Vitest, 16 files) | **181 / 181 passed** |
| Playwright walkthrough (`npm run test:e2e`) | **47 / 47 checks passed** (no-backend scope; see below) |
| Page errors during walkthrough | **0** |
| Emoji in UI code (`src/`) | **0** |
| Secrets in code | **0** (the demo password `demo1234` no longer exists anywhere in code) |
| `any` in TypeScript | **0** |
| i18n key parity (en vs kn) | **626 / 626 keys, 0 missing, 0 placeholder mismatches** (incl. 47 `calls.*` keys) |
| SQL migrations | 003, 005, 008 parse clean by `pg-query-parser`; 001, 002, 004, 006, 007 parse clean once the Postgres 11+ `EXECUTE FUNCTION` trigger syntax is accounted for (see note below); RLS on all tables |

**SQL parse note — read this before trusting the earlier claim.** The
original report said the migrations "parsed clean by the real Postgres
parser". Re-checking during the extension work found that
`pg-query-parser` does **not** throw on error — it returns
`{error, query: []}` — and the earlier check never inspected the error
field. The real result: migrations 001, 002, 004, 006, 007 each report
one parse error, `syntax error at or near "function"` on
`CREATE TRIGGER ... EXECUTE FUNCTION`. Substituting the legacy
`EXECUTE PROCEDURE` spelling makes all five parse clean (001: 23 stmts,
002: 12, 004: 101, 006: 36, 007: 24), which proves the only issue is the
Postgres 11+ `EXECUTE FUNCTION` syntax — valid on real Postgres
(Supabase runs PG 15) but unsupported by the old libpg_query bundled in
`pg-query-parser`. The SQL itself is fine; the earlier verification
method was flawed, and this note corrects the record. Migration 008
parses clean as written (3 stmts).

## App unit tests (105)

`src/lib/doseLogic.test.ts` (29) + `src/validation/medication.test.ts`
(14) + extension suites (39) + integration suites (15) +
`src/lib/callPrefs.test.ts` (8, new in the demo-removal pass):

**Extension suites (39, phase 1):** photo transform (rotate/crop),
OCR suggestion parsing, call-preference / consent / pregnancy Zod
schemas, voice-settings validation, provider call-history helpers.

**Integration suites (15, phase 2):** `src/lib/callHistory.test.ts`
(10) — dose-status resolution for call attempts (linked event, same-day
match, pending-today, null otherwise; timezone-independent fixtures) and
history-entry building (newest first, responses joined oldest first,
missing medicines skipped, never invented); `src/i18n/parity.test.ts`
(5) — same key set in both dictionaries (626 each), all 47 `calls.*`
keys present, identical interpolation placeholders, no empty
translations.

**Call-preference defaults (8, demo-removal pass):**
`src/lib/callPrefs.test.ts` — the call language follows the patient's
profile preferred language (Kannada patient → Kannada calls), falls
back to the app language when the profile language is missing or
unsupported, and reaches `'en'` only as the last resort; the safe
defaults (calls off, consent not given, 21:00–07:00 quiet hours) are
unchanged; `callsConfigured()` is false without the Twilio flag.

- `liveStatus`: taken/skipped never change; pending flips to missed after
  the grace window; custom grace respected; snooze extends the deadline.
- `countdownFor`: due-in / misses-in / overdue.
- `isMedicationActiveOn` / `isScheduleDueOn`: paused/completed excluded;
  start/end dates and days-of-week respected.
- `dosesForDate`: one dose per due schedule joined to its event; sorted by
  time; live grace flip; `live: false` returns stored status (used by the
  escalation job).
- `nextDose` / `dueNow` / `expiredPendingDoses`.
- `adherenceSummary`: weekly counts + percent; 100% with no doses; 7-day
  perfect streak.
- `detectConflicts`: exact duplicate, same name/different strength, same
  time, within-15-minutes overlap, clean case silent, edit excludes self.
- Zod schemas: valid medication accepted; missing name/strength/
  instructions/dose-amount/times rejected; malformed time/date rejected;
  >6 times rejected; phone/email/password rules; grace bounds 5–240 min.

## Edge Function unit tests (181)

`npm run test:functions` — Vitest over `supabase/functions/` (16 files):
due-dose scanning (quiet hours, consent gate, retry limits, idempotency),
Twilio request signing + call triggering, TwiML keypad/speech handling
(Press 1 taken / 2 later / 3 help; never taken from unanswered/voicemail/
ambiguous), status callbacks, escalation delay + consent gating,
escalation-status transitions (completed calls never retried), and
call-language resolution (13 tests in `_shared/language.test.ts`:
`call_preferences.language` wins, else `profiles.preferred_language`,
else a logged `'en'` last resort; voice fallback never switches
language; retries re-resolve per attempt). Pure `_shared/` modules are
tested without any Twilio or Supabase call.

Twilio request-signature validation (27 tests, added with the
signature fix): `_shared/twilioSignature.test.ts` (15 tests) covers
the HMAC-SHA1 validator — base-string construction, agreement with
node:crypto as an independent implementation, agreement with two
signatures computed with the openssl CLI, timing-safe comparison,
and fail-closed behaviour (tampered param, wrong URL, missing
header, missing token, wrong token, empty-params URL-only
signature). `call-webhook/index.test.ts` and
`call-status/index.test.ts` (6 tests each) run the real handlers
with a stubbed Deno runtime and a mocked Supabase REST layer: a
missing/invalid/tampered signature and a missing
`TWILIO_AUTH_TOKEN` are all 403 with a generic body and zero
database access; a validly signed request reaches the normal flow
(greeting TwiML served; terminal status recorded).

## Playwright walkthrough (47 checks, 0 page errors)

`tests/walkthrough.mjs` (Playwright 1.55, headless Chromium) — the
no-backend scope only. Demo mode was removed, so there is no demo
login and no sample data to walk through: the script covers what is
verifiable WITHOUT a live Supabase project and prints the rest as NOT
TESTED (nothing is faked to make those checks pass).

**Phase 1 — language screen:** first visit redirects to /language;
one dropdown (not two buttons) lists English + Kannada with native
and English labels; a real associated `<label>`; Continue button
present; the accessibility tree names the combobox.

**Phase 2 — Kannada + not-configured state:** selecting Kannada
re-renders the screen in Kannada; Continue navigates home; `/` shows
the full-screen not-configured state naming `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` and pointing at `.env.example`, readable in
Kannada; no demo login or sample data anywhere; /language still
renders directly; switching back to English re-renders the notice.

**Phase 3 — login page:** form renders (email + password + submit);
not-configured note shown; its own language dropdown re-renders the
page in Kannada and back; validation errors on empty submit;
submitting with credentials shows the honest not-configured error,
stays on /login, and creates no session (no Supabase keys in
localStorage).

**Phase 4 — signup page:** form renders (name + email + password +
3 role radios); language dropdown works there too; validation errors
on empty submit; submitting shows the not-configured error and
creates no session.

**Phase 5 — protected routes:** /dashboard, /medications, /calls,
/settings/profile, /admin, /onboarding all redirect to /login.

**Phase 6 — unknown route:** shows the not-found page.

**Phase 7 — keyboard-only language flow (fresh context):** the
dropdown is reachable by Tab with a visible `:focus-visible` ring;
ArrowDown changes the value (en → kn) and re-renders in Kannada;
Continue is reachable by Tab and navigates on Enter.

**Phase 8 — mobile:** the language screen, the not-configured page,
and the login page all fit the 375px width with no horizontal
overflow.

**Historical note:** the previous walkthrough (100 checks, two
consecutive full runs, 0 page errors) covered the full golden path —
signup → onboarding → medications → schedule → history → analytics →
offline sync → escalation → caregiver/HCP/admin → photos → voice
settings → consent → pregnancy → call history → keyboard-only path →
mobile — against demo mode. That walkthrough and its demo accounts no
longer exist; its screenshots (01–24) are kept as history. The
authenticated flows it covered are NOT TESTED against the current
build until a live Supabase project is wired.

**Screenshots** (29, in `tests/screenshots/`): 01–24 are the
historical demo-walkthrough shots; 25–27 are current —
`25-language-dropdown.png` (language screen with the new dropdown),
`26-login-dropdown.png` (login page with dropdown + not-configured
note), `27-not-configured.png` (not-configured state, in Kannada).
All three were visually inspected: calm teal/green design, large
readable text, no emoji, no layout breakage; the not-configured page
names both env vars and lists the setup steps.

## Bugs found and fixed during verification

Base app:

1. **Escalation never fired** — `dosesForDate` live-flipped pending doses
   to missed, so the escalation job never saw a stored-pending dose past
   grace. Fixed with a `live: false` option used by the escalation check
   (unit-tested).
2. **Reminder dialog re-appeared after reload** — dismissals lived only in
   memory. Now persisted in `sessionStorage` (survives reloads, clears
   with the tab; stale dates pruned).
3. **i18next plurals rendered singular** — `_plural` suffixes are v3
   format; i18next 27 needs `_other`. Renamed in both language files and
   verified in EN + KN ("0 doses", "1 dose", "3 doses").
4. **Weekly mini-bars misleading** — days with no scheduled doses showed
   full-height 100% bars. Empty days now render short.
5. **Dates ignored the app language** — date labels now use `kn-IN` when
   Kannada is selected.
6. **Logout confirm button said "Confirm"** — now says "Log out".

Extension / integration (phase 2):

7. **Call dialog showed a stale result on re-open** — `result` was reset
   on open, so the second open rendered the result view first and the
   focus effect found no first button. Reset now happens on close; focus
   lands on "I have taken it" on every open.
8. **Keyboard helper matched `<body>`** — `tabToText` read
   `textContent`, which on `<body>` contains every label, so it returned
   immediately without tabbing. It now only matches interactive elements.
9. **Time input lost focus on every keystroke** — the wrapper used
   `key={time-index}`, so each keystroke remounted the input. Time inputs
   are now controlled with a stable key; ArrowUp ×4 moves 08:00 → 12:00.
10. **Mobile header overflowed at 375px** — the header's right cluster
    (language + Log out + sync + demo badge) pushed `scrollWidth` to 552
    on every page. Wordmark hides below `sm`, demo-badge text below
    420px, sync text below `md`, language icon below `sm`; all pages now
    measure exactly 375px.
11. **Walkthrough counted a stale dashboard button** — waiting for the
    first mark-taken button after navigating to /schedule could match a
    dashboard button still mounted during the route transition. The step
    now waits for the schedule page's own dose articles and all three
    pending doses.
12. **Headless file picker flake (test-only, not an app bug)** — pressing
    Enter on the photo picker sometimes failed to raise the headless file
    picker even though the button and the hidden input both received the
    click (verified by probing: ref healthy, input connected). Space
    (key-up activation) opened the picker 9/9 times and is now tried
    first, then Enter; if neither opens it, `setInputFiles` delivers the
    file to the same input and the fallback is logged, never silent.

Demo-removal pass:

13. **Call language hard-coded to English** — `defaultCallPreferences`
    set `language: 'en'`, so a Kannada patient who enabled calls
    without touching the language selector would have received English
    calls. It now takes the patient's profile preferred language
    (`defaultCallLanguage`: profile → app language → `'en'` as an
    explicit last resort), and both callers (`VoiceReminderSettings`,
    `ConsentSettings`) pass the signed-in profile's
    `preferred_language`. Covered by 8 unit tests in
    `src/lib/callPrefs.test.ts`; the user can still override it in
    `LanguageVoiceSelector`.

## Not verified

- All authenticated flows against the current build — no live
  Supabase project exists yet (the free plan is at its 2-project
  limit), so sign-in, onboarding, dashboard, medications, schedule,
  dose recording, history, analytics, export, offline sync, grace
  escalation, caregiver/HCP views, photos, voice settings, consent,
  pregnancy, call history, profile, privacy, reminders, help, and
  admin are NOT TESTED end to end. They were last verified in the
  pre-removal demo build (100-check walkthrough, see the historical
  note above); that build no longer exists, so those results do not
  cover the current code. Re-running the golden path needs a live
  project + a reworked walkthrough that signs up a real account.
- Real Supabase mode end to end: the provider code is written and the
  migrations parse, but live auth/RLS behavior is unverified.
- A real voice-call reminder (no funded Twilio account): the call flow
  is unit-tested (181 tests, incl. signature validation against
  node:crypto + openssl cross-checks), but no phone has rung and the
  webhook/TwiML path has never run against Twilio — live signature
  validation against real Twilio requests is still untested.
- Voice (Listen) output audibly — construction verified, headless
  Chromium has no audio.
- Screen-reader experience with a real screen reader — the walkthrough
  asserts roles/names from accessibility-tree snapshots, which verify
  structure and labels, not the lived experience.
- Kannada by a native speaker (see README known gaps).
- The service worker's offline app-shell caching beyond the in-app
  offline queue (the walkthrough covers the queue, not a cold offline
  load).
