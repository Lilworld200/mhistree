-- Allow the signed-in direct clinician to deliberately book outside advertised
-- availability. This changes scheduling policy only; current care authority,
-- patient/clinician overlap exclusions and version locks remain mandatory.
create or replace function mhistree.check_booking_availability()
returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb := coalesce(nullif(current_setting('mhistree.context',true),''),'{}')::jsonb;
begin
  if new.state='accepted'
     and context->>'kind'='direct'
     and context->>'connectionId'=new.connection_id::text
     and mhistree.is_session_actor(new.practitioner_account_id)
     and mhistree.can_participate(new.connection_id,'appointments.manage') then
    return new;
  end if;
  if new.state='accepted'
     and exists(select 1 from mhistree.availability_slots where account_id=new.practitioner_account_id and active)
     and not exists(select 1 from mhistree.availability_slots where account_id=new.practitioner_account_id and active and starts_at<=new.starts_at and ends_at>=new.ends_at) then
    raise exception 'BOOKING_OUTSIDE_AVAILABILITY';
  end if;
  return new;
end;
$$;
revoke all on function mhistree.check_booking_availability() from public;
