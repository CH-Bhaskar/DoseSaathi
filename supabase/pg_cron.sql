-- ============================================================================
-- DoseSaathi — pg_cron schedule for scan-due-calls
-- ============================================================================
-- DOCUMENTED ONLY — DO NOT APPLY. No live Supabase project exists for
-- DoseSaathi yet (see EXTENSION_PLAN.md, decision 3). When a project
-- is created and migrations 001–007 are applied, a project admin runs
-- this file once in the SQL Editor to schedule the scanner.
--
-- What it does: every 10 minutes, pg_cron calls the scan-due-calls
-- Edge Function over HTTP (pg_net), which queues reminder calls for
-- doses due now, retries unanswered calls, triggers queued attempts,
-- and escalates unconfirmed doses to caregivers (consent-gated).
--
-- Before running, replace the two placeholders:
--   <PROJECT_REF>        — the Supabase project ref, e.g. abcd1234efgh
--   <SERVICE_ROLE_KEY>   — the project's service_role key (Dashboard →
--                          Settings → API). This key bypasses RLS and
--                          must never be pasted into frontend code or
--                          committed to git.
-- ============================================================================

-- Extensions (run once; harmless if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous schedule with this name, then (re)create it.
select cron.unschedule('dose-saathi-scan-due-calls')
  where exists (
    select 1 from cron.job where jobname = 'dose-saathi-scan-due-calls'
  );

select cron.schedule(
  'dose-saathi-scan-due-calls',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scan-due-calls',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the job exists:
--   select jobname, schedule, active from cron.job
--     where jobname = 'dose-saathi-scan-due-calls';
--
-- Check recent runs (pg_cron keeps job history in cron.job_run_details):
--   select start_time, end_time, status, return_message
--     from cron.job_run_details
--     order by start_time desc limit 10;
--
-- To pause the scanner without deleting the schedule:
--   update cron.job set active = false
--     where jobname = 'dose-saathi-scan-due-calls';
