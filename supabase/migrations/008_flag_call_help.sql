-- ============================================================================
-- DoseSaathi — 008: flag_call_help RPC (in-app "I need help" from a call)
-- ============================================================================
-- Apply AFTER 007_call_attempts.sql, in the Supabase Dashboard → SQL
-- Editor (paste the whole file and click Run). Idempotent:
-- create or replace function + drop policy if exists, so re-running it
-- is safe.
--
-- WHY AN RPC
-- ----------
-- 007 deliberately grants the browser NO update policy on
-- call_attempts: attempt rows are written only by the Edge Functions
-- (service_role). But the patient must be able to ask for help from
-- the in-app call-history dialog ("I need help", the app equivalent of
-- pressing 3 on the call). A narrow SECURITY DEFINER function is the
-- safe bridge: it checks the caller is the attempt's patient, flips
-- ONLY escalation_status to 'pending', and logs the audit event.
-- Nothing else about the attempt can change through this path, and the
-- caregiver alert itself is still written by scan-due-calls only after
-- the consent gate passes — so "no consent, no alert" still holds.
--
-- RETURNS
-- -------
-- true when the attempt was flagged (or was already pending/notified —
-- flagging is idempotent from the caller's point of view); false when
-- the attempt does not exist. Raises an exception when the caller is
-- not the attempt's patient.
-- ============================================================================

create or replace function public.flag_call_help(p_attempt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_escalation_status text;
begin
  select patient_id, escalation_status
    into v_patient_id, v_escalation_status
    from public.call_attempts
   where id = p_attempt_id;

  -- Unknown attempt: nothing to flag.
  if v_patient_id is null then
    return false;
  end if;

  -- Only the patient themself may flag their own call. Caregivers read
  -- call history (007 RLS) but never act on it.
  if auth.uid() is distinct from v_patient_id then
    raise exception 'not authorized to flag this call';
  end if;

  -- Already flagged or already handled: idempotent success, no second
  -- audit row.
  if v_escalation_status in ('pending', 'notified') then
    return true;
  end if;

  update public.call_attempts
     set escalation_status = 'pending',
         updated_at = now()
   where id = p_attempt_id;

  insert into public.audit_events (
    user_id, action, entity, entity_id, details
  ) values (
    v_patient_id,
    'call_help_requested',
    'call_attempt',
    p_attempt_id,
    jsonb_build_object('source', 'app')
  );

  return true;
end;
$$;

-- Authenticated users may call it; the function itself enforces the
-- patient-only check. Anonymous callers get nothing.
revoke all on function public.flag_call_help(uuid) from public;
grant execute on function public.flag_call_help(uuid) to authenticated;
