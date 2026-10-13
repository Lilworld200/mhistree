create extension if not exists btree_gist;
create function mhistree.can_participate(p_connection uuid,p_privilege text) returns boolean language plpgsql security definer set search_path='' as $$
declare actor record; c record; context jsonb;
begin
 if p_privilege not in ('appointments.manage','messages.send','requests.read') then return false;end if;
 select a.id,a.person_id into actor from mhistree.accounts a join mhistree.sessions s on s.account_id=a.id
 where s.digest=current_setting('mhistree.session',true) and a.status='active' and s.retired_at is null and s.expires_at>clock_timestamp() and s.session_epoch=a.session_epoch for share of s,a;
 if not found then return false;end if;
 select * into c from mhistree.connections where id=p_connection and status='active' for share;
 if not found or not exists(select 1 from (select categories,exclusions from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s where exists(select 1 from unnest(s.categories) v where not v=any(s.exclusions))) then return false;end if;
 if c.kind='organization' and not exists(select 1 from mhistree.organizations where id=c.organization_id and status='approved') then return false;end if;
 if c.kind='direct' and not exists(select 1 from mhistree.professionals where account_id=c.practitioner_account_id and status='approved') then return false;end if;
 context:=current_setting('mhistree.context',true)::jsonb;
 if context->>'kind'='patient' then return actor.person_id=c.patient_person_id;end if;
 if context->>'connectionId' is distinct from c.id::text or context->>'kind'<>c.kind then return false;end if;
 if not exists(select 1 from mhistree.professionals where account_id=actor.id and status='approved' and p_privilege=any(privileges)) then return false;end if;
 if c.kind='direct' then return c.practitioner_account_id=actor.id;end if;
 return context->>'organizationId'=c.organization_id::text and exists(select 1 from mhistree.memberships m join mhistree.assignments a on a.organization_id=m.organization_id and a.account_id=m.account_id
 where m.organization_id=c.organization_id and m.account_id=actor.id and m.active and p_privilege=any(m.privileges) and a.active and a.patient_person_id=c.patient_person_id and a.id::text=context->>'assignmentId');
exception when invalid_text_representation then return false;
end;$$;
revoke all on function mhistree.can_participate(uuid,text) from public;
grant execute on function mhistree.can_participate(uuid,text) to mhistree_runtime;
create table mhistree.appointments (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references mhistree.connections(id),
 patient_person_id uuid not null references mhistree.persons(id),
 practitioner_account_id uuid not null references mhistree.accounts(id),
 starts_at timestamptz not null,ends_at timestamptz not null,timezone text not null,
 state text not null default 'requested' check(state in ('requested','accepted','declined','cancelled','paused')),
 version integer not null default 1,
 request_key uuid not null unique,
 created_at timestamptz not null default clock_timestamp(),
 check(ends_at>starts_at),
 exclude using gist(practitioner_account_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(state in ('requested','accepted')),
 exclude using gist(patient_person_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(state in ('requested','accepted'))
);
create table mhistree.care_threads (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null unique references mhistree.connections(id),
 patient_person_id uuid not null references mhistree.persons(id),created_at timestamptz not null default clock_timestamp()
);
create table mhistree.care_messages (
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references mhistree.care_threads(id),
 author_account_id uuid not null references mhistree.accounts(id),content text not null check(length(content) between 1 and 10000),
 request_key uuid not null,sequence bigint generated always as identity unique,
 sent_at timestamptz not null default clock_timestamp(),delivery_state text not null default 'stored' check(delivery_state in ('stored','delivered','failed')),
 unique(author_account_id,request_key)
);
-- T23 supplies real request/result producers through this versioned projection.
create table mhistree.service_requests (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references mhistree.connections(id),
 patient_person_id uuid not null references mhistree.persons(id),service_name text not null,
 state text not null check(state in ('requested','accepted','in-progress','performed','result-draft','finalized','cancelled','paused')),
 result_event_id uuid references mhistree.contributions(id),version integer not null default 1,
 fixture boolean not null default false,created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.appointments enable row level security;
alter table mhistree.care_threads enable row level security;
alter table mhistree.care_messages enable row level security;
alter table mhistree.service_requests enable row level security;
create policy appointment_read on mhistree.appointments for select to mhistree_runtime using(mhistree.can_participate(connection_id,'appointments.manage') or exists(select 1 from mhistree.accounts a where a.person_id=patient_person_id and mhistree.owns_patient_account(a.id)));
create policy appointment_insert on mhistree.appointments for insert to mhistree_runtime with check(mhistree.can_participate(connection_id,'appointments.manage'));
create policy appointment_update on mhistree.appointments for update to mhistree_runtime using(mhistree.can_participate(connection_id,'appointments.manage')) with check(mhistree.can_participate(connection_id,'appointments.manage'));
create policy thread_read on mhistree.care_threads for select to mhistree_runtime using(mhistree.can_participate(connection_id,'messages.send'));
create policy thread_insert on mhistree.care_threads for insert to mhistree_runtime with check(mhistree.can_participate(connection_id,'messages.send'));
create policy care_message_read on mhistree.care_messages for select to mhistree_runtime using(exists(select 1 from mhistree.care_threads t where t.id=thread_id));
create policy care_message_insert on mhistree.care_messages for insert to mhistree_runtime with check(mhistree.owns_patient_account(author_account_id) and exists(select 1 from mhistree.care_threads t where t.id=thread_id));
create policy service_request_read on mhistree.service_requests for select to mhistree_runtime using(mhistree.can_participate(connection_id,'requests.read') or exists(select 1 from mhistree.accounts a where a.person_id=patient_person_id and mhistree.owns_patient_account(a.id)));
-- Patient ownership predicate avoids granting runtime SELECT on accounts/session registries.
create function mhistree.owns_patient_person(p_person uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from mhistree.accounts a where a.person_id=p_person and mhistree.owns_patient_account(a.id));$$;
revoke all on function mhistree.owns_patient_person(uuid) from public;
grant execute on function mhistree.owns_patient_person(uuid) to mhistree_runtime;
drop policy appointment_read on mhistree.appointments;
create policy appointment_read on mhistree.appointments for select to mhistree_runtime using(mhistree.can_participate(connection_id,'appointments.manage') or mhistree.owns_patient_person(patient_person_id));
drop policy service_request_read on mhistree.service_requests;
create policy service_request_read on mhistree.service_requests for select to mhistree_runtime using(mhistree.can_participate(connection_id,'requests.read') or mhistree.owns_patient_person(patient_person_id));
grant select,insert,update on mhistree.appointments to mhistree_runtime;
grant select,insert on mhistree.care_threads,mhistree.care_messages to mhistree_runtime;
grant select on mhistree.service_requests to mhistree_runtime;
grant usage on sequence mhistree.care_messages_sequence_seq to mhistree_runtime;
create index appointment_connection_idx on mhistree.appointments(connection_id,starts_at);
create index care_message_thread_idx on mhistree.care_messages(thread_id,sequence);
create index service_request_patient_idx on mhistree.service_requests(patient_person_id,created_at);
create function mhistree.is_session_actor(p_account uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mhistree.sessions s join mhistree.accounts a on a.id=s.account_id where s.digest=current_setting('mhistree.session',true) and a.id=p_account and a.status='active' and s.retired_at is null and s.expires_at>statement_timestamp() and s.session_epoch=a.session_epoch);
$$;
revoke all on function mhistree.is_session_actor(uuid) from public;
grant execute on function mhistree.is_session_actor(uuid) to mhistree_runtime;
drop policy care_message_insert on mhistree.care_messages;
create policy care_message_insert on mhistree.care_messages for insert to mhistree_runtime with check(mhistree.is_session_actor(author_account_id) and exists(select 1 from mhistree.care_threads t where t.id=thread_id));
create function mhistree.validate_care_origin() returns trigger language plpgsql security definer set search_path='' as $$
declare c record;
begin
 select * into c from mhistree.connections where id=new.connection_id;
 if c.patient_person_id is distinct from new.patient_person_id then raise exception 'CARE_PATIENT_MISMATCH';end if;
 if tg_table_name='appointments' then
  if tg_op='UPDATE' then
   if new.state='paused' then return new;end if;
  end if;
  if not exists(select 1 from mhistree.professionals where account_id=new.practitioner_account_id and status='approved' and 'appointments.manage'=any(privileges)) then raise exception 'CARE_PRACTITIONER_DENIED';end if;
  if c.kind='direct' and c.practitioner_account_id is distinct from new.practitioner_account_id then raise exception 'CARE_PRACTITIONER_MISMATCH';end if;
  if c.kind='organization' and not exists(select 1 from mhistree.memberships m join mhistree.assignments a on a.organization_id=m.organization_id and a.account_id=m.account_id where m.organization_id=c.organization_id and m.account_id=new.practitioner_account_id and m.active and 'appointments.manage'=any(m.privileges) and a.active and a.patient_person_id=c.patient_person_id) then raise exception 'CARE_ASSIGNMENT_DENIED';end if;
 end if;
 return new;
end;$$;
create trigger appointment_origin before insert or update on mhistree.appointments for each row execute function mhistree.validate_care_origin();
create trigger thread_origin before insert on mhistree.care_threads for each row execute function mhistree.validate_care_origin();
create function mhistree.pause_connection_care() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and (new.status='revoked' or new.revision<>old.revision) then
  update mhistree.appointments set state='paused',version=version+1 where connection_id=new.id and state in ('requested','accepted');
  update mhistree.service_requests set state='paused',version=version+1 where connection_id=new.id and state not in ('finalized','cancelled','paused');
 end if;return new;
end;$$;
create trigger connection_care_pause after update on mhistree.connections for each row execute function mhistree.pause_connection_care();
