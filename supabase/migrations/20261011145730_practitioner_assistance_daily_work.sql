create table mhistree.practitioner_ai_runs (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references mhistree.accounts(id), connection_id uuid not null references mhistree.connections(id),
 patient_person_id uuid not null references mhistree.persons(id), purpose text not null, question text not null, response jsonb not null, evidence_ids uuid[] not null, private_note_ids uuid[] not null, created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.practitioner_ai_runs enable row level security;
create policy practitioner_ai_read on mhistree.practitioner_ai_runs for select to mhistree_runtime using(mhistree.is_session_actor(account_id) and mhistree.can_participate(connection_id,'records.read'));
create policy practitioner_ai_insert on mhistree.practitioner_ai_runs for insert to mhistree_runtime with check(mhistree.is_session_actor(account_id) and mhistree.can_participate(connection_id,'records.read'));
grant select,insert on mhistree.practitioner_ai_runs to mhistree_runtime;
create trigger practitioner_ai_immutable before update or delete on mhistree.practitioner_ai_runs for each row execute function mhistree.prevent_history_rewrite();
create table mhistree.availability_slots (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references mhistree.accounts(id), starts_at timestamptz not null,ends_at timestamptz not null,timezone text not null,active boolean not null default true, version integer not null default 1,check(ends_at>starts_at),
 exclude using gist(account_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(active)
);
alter table mhistree.availability_slots enable row level security;
create table mhistree.message_read_positions(account_id uuid not null references mhistree.accounts(id),thread_id uuid not null references mhistree.care_threads(id),sequence bigint not null,primary key(account_id,thread_id));
alter table mhistree.message_read_positions enable row level security;
create table mhistree.notifications(id uuid primary key default gen_random_uuid(),account_id uuid not null references mhistree.accounts(id),event_key text not null,kind text not null,connection_id uuid references mhistree.connections(id),reference_id uuid not null,created_at timestamptz not null default clock_timestamp(),read_at timestamptz,unique(account_id,event_key));
alter table mhistree.notifications enable row level security;
create index notification_account_idx on mhistree.notifications(account_id,created_at desc);
create index availability_account_idx on mhistree.availability_slots(account_id,starts_at);
create function mhistree.notify_care_event() returns trigger language plpgsql security definer set search_path='' as $$declare c record;event_key text;kind text;target uuid;begin
if tg_table_name='care_messages' then select co.* into c from mhistree.care_threads t join mhistree.connections co on co.id=t.connection_id where t.id=new.thread_id;event_key:='message:'||new.id;kind:='message';
elsif tg_table_name='appointments' then select * into c from mhistree.connections where id=new.connection_id;event_key:='appointment:'||new.id||':'||new.version;kind:='appointment';
else select * into c from mhistree.connections where id=new.connection_id;event_key:='request:'||new.id||':'||new.version;kind:='request';end if;
for target in select id from mhistree.accounts where person_id=c.patient_person_id and status='active' union select c.practitioner_account_id where c.practitioner_account_id is not null loop
insert into mhistree.notifications(account_id,event_key,kind,connection_id,reference_id) values(target,event_key,kind,c.id,new.id) on conflict(account_id,event_key) do nothing;end loop;return new;end;$$;
create trigger message_notification after insert on mhistree.care_messages for each row execute function mhistree.notify_care_event();
create trigger appointment_notification after insert or update on mhistree.appointments for each row execute function mhistree.notify_care_event();
create trigger request_notification after insert or update on mhistree.service_requests for each row execute function mhistree.notify_care_event();
create or replace function mhistree.can_participate(p_connection uuid,p_privilege text) returns boolean language plpgsql security definer set search_path='' as $$
declare actor record; c record; context jsonb;
begin
 if p_privilege not in ('appointments.manage','messages.send','requests.read','requests.create','results.finalize','records.read') then return false;end if;
 select a.id,a.person_id into actor from mhistree.accounts a join mhistree.sessions s on s.account_id=a.id
 where s.digest=current_setting('mhistree.session',true) and a.status='active' and s.retired_at is null and s.expires_at>clock_timestamp() and s.session_epoch=a.session_epoch for share of s,a;
 if not found then return false;end if;
 select * into c from mhistree.connections where id=p_connection and status='active' for share;
 if not found or not exists(select 1 from (select categories,exclusions from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s where exists(select 1 from unnest(s.categories) v where not v=any(s.exclusions))) then return false;end if;
 if c.kind='organization' and not exists(select 1 from mhistree.organizations where id=c.organization_id and status='approved') then return false;end if;
 if c.kind='direct' and not exists(select 1 from mhistree.professionals where account_id=c.practitioner_account_id and status='approved') then return false;end if;
 context:=current_setting('mhistree.context',true)::jsonb;
 if context->>'kind'='patient' then return p_privilege in ('appointments.manage','messages.send','requests.read') and actor.person_id=c.patient_person_id;end if;
 if context->>'connectionId' is distinct from c.id::text or context->>'kind'<>c.kind then return false;end if;
 if not exists(select 1 from mhistree.professionals where account_id=actor.id and status='approved' and p_privilege=any(privileges)) then return false;end if;
 if c.kind='direct' then return c.practitioner_account_id=actor.id;end if;
 return context->>'organizationId'=c.organization_id::text and exists(select 1 from mhistree.memberships m join mhistree.assignments a on a.organization_id=m.organization_id and a.account_id=m.account_id
 where m.organization_id=c.organization_id and m.account_id=actor.id and m.active and p_privilege=any(m.privileges) and a.active and a.patient_person_id=c.patient_person_id and a.id::text=context->>'assignmentId');
exception when invalid_text_representation then return false;
end;$$;


create policy message_position_owner on mhistree.message_read_positions for all to mhistree_runtime using(mhistree.is_session_actor(account_id) and exists(select 1 from mhistree.care_threads t where t.id=thread_id)) with check(mhistree.is_session_actor(account_id) and exists(select 1 from mhistree.care_threads t where t.id=thread_id));
grant select,insert,update on mhistree.message_read_positions to mhistree_runtime;
create function mhistree.check_booking_availability() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.state='accepted' and exists(select 1 from mhistree.availability_slots where account_id=new.practitioner_account_id and active) and not exists(select 1 from mhistree.availability_slots where account_id=new.practitioner_account_id and active and starts_at<=new.starts_at and ends_at>=new.ends_at) then raise exception 'BOOKING_OUTSIDE_AVAILABILITY';end if;return new;end;$$;
create trigger booking_availability before insert or update on mhistree.appointments for each row execute function mhistree.check_booking_availability();
