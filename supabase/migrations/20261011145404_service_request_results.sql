alter table mhistree.service_requests add column requester_account_id uuid references mhistree.accounts(id), add column recipient_connection_id uuid references mhistree.connections(id), add column recipient_account_id uuid references mhistree.accounts(id), add column priority text check(priority in ('routine','urgent')),add column requested_for timestamptz,add column authorization_basis text,add column request_key uuid unique,add column paused_from text,add column result_work_id uuid references mhistree.clinical_work(id);
create index service_requests_recipient_idx on mhistree.service_requests(recipient_connection_id,state);
create function mhistree.valid_result_recipient(p_connection uuid,p_patient uuid,p_recipient uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from mhistree.connections c join mhistree.professionals p on p.account_id=c.practitioner_account_id join mhistree.accounts a on a.id=p.account_id join lateral(select * from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s on true where c.id=p_connection and c.patient_person_id=p_patient and c.kind='direct' and c.status='active' and p.account_id=p_recipient and p.status='approved' and a.status='active' and 'results.finalize'=any(p.privileges) and 'result'=any(s.categories) and not('result'=any(s.exclusions)) and p_patient=any(s.origin_person_ids) and ('*'=any(s.origin_context_ids) or 'direct:'||c.id::text=any(s.origin_context_ids)));$$;
revoke all on function mhistree.valid_result_recipient(uuid,uuid,uuid) from public;
grant execute on function mhistree.valid_result_recipient(uuid,uuid,uuid) to mhistree_runtime;
create policy service_request_recipient_read on mhistree.service_requests for select to mhistree_runtime using(mhistree.can_participate(recipient_connection_id,'requests.read'));
create policy service_request_insert on mhistree.service_requests for insert to mhistree_runtime with check(mhistree.is_session_actor(requester_account_id) and mhistree.can_participate(connection_id,'requests.create') and mhistree.valid_result_recipient(recipient_connection_id,patient_person_id,recipient_account_id));
create policy service_request_update on mhistree.service_requests for update to mhistree_runtime using(mhistree.can_participate(connection_id,'requests.create') or mhistree.can_participate(recipient_connection_id,'results.finalize')) with check(mhistree.can_participate(connection_id,'requests.create') or mhistree.can_participate(recipient_connection_id,'results.finalize'));
grant insert,update on mhistree.service_requests to mhistree_runtime;
create table mhistree.request_transitions(id bigint generated always as identity primary key,request_id uuid not null references mhistree.service_requests(id),actor_account_id uuid not null references mhistree.accounts(id),from_state text not null,to_state text not null,reason text,recorded_at timestamptz not null default clock_timestamp());
alter table mhistree.request_transitions enable row level security;
create policy request_transition_read on mhistree.request_transitions for select to mhistree_runtime using(exists(select 1 from mhistree.service_requests r where r.id=request_id));
create policy request_transition_insert on mhistree.request_transitions for insert to mhistree_runtime with check(mhistree.is_session_actor(actor_account_id) and exists(select 1 from mhistree.service_requests r where r.id=request_id));
grant select,insert on mhistree.request_transitions to mhistree_runtime;grant usage on sequence mhistree.request_transitions_id_seq to mhistree_runtime;
create trigger request_transition_immutable before update or delete on mhistree.request_transitions for each row execute function mhistree.prevent_history_rewrite();
create function mhistree.pause_recipient_requests() returns trigger language plpgsql security definer set search_path='' as $$begin
if old.status='active' and(new.status<>'active' or new.revision<>old.revision) then update mhistree.service_requests set paused_from=state,state='paused',version=version+1 where recipient_connection_id=new.id and state not in('finalized','cancelled','paused');end if;return new;end;$$;
create trigger recipient_request_pause after update on mhistree.connections for each row execute function mhistree.pause_recipient_requests();
create function mhistree.request_origin_guard() returns trigger language plpgsql set search_path='' as $$begin
if tg_op='UPDATE' and (new.connection_id,new.patient_person_id,new.requester_account_id,new.recipient_connection_id,new.recipient_account_id,new.service_name,new.request_key) is distinct from(old.connection_id,old.patient_person_id,old.requester_account_id,old.recipient_connection_id,old.recipient_account_id,old.service_name,old.request_key) then raise exception 'REQUEST_ORIGIN_IMMUTABLE';end if;
if tg_op='UPDATE' and new.state='paused' and old.state<>'paused' then new.paused_from=old.state;end if;return new;end;$$;
create trigger request_origin before insert or update on mhistree.service_requests for each row execute function mhistree.request_origin_guard();
create or replace function mhistree.can_participate(p_connection uuid,p_privilege text) returns boolean language plpgsql security definer set search_path='' as $$
declare actor record; c record; context jsonb;
begin
 if p_privilege not in ('appointments.manage','messages.send','requests.read','requests.create','results.finalize') then return false;end if;
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

