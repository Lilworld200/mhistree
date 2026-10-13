create table mhistree.clinical_work (
 id uuid primary key default gen_random_uuid(), patient_person_id uuid not null references mhistree.persons(id),
 author_account_id uuid not null references mhistree.accounts(id), connection_id uuid not null references mhistree.connections(id),
 original_context text not null, organization_id uuid references mhistree.organizations(id),
 kind text not null check(kind in ('private-note','reminder','draft')), category text not null,
 body jsonb not null, occurred_at jsonb not null, timezone text not null,
 state text not null default 'draft' check(state in ('draft','paused','finalized','cancelled')),
 version integer not null default 1, team_account_ids uuid[] not null default '{}', due_at timestamptz,
 final_event_id uuid references mhistree.contributions(id), created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 request_key uuid not null unique, ai_provenance jsonb,
 check(kind='draft' or cardinality(team_account_ids)=0)
);
create index clinical_work_connection_idx on mhistree.clinical_work(connection_id,state);
create index clinical_work_author_idx on mhistree.clinical_work(author_account_id,due_at);
create table mhistree.clinical_work_versions(
 id bigint generated always as identity primary key, work_id uuid not null references mhistree.clinical_work(id),
 version integer not null, actor_account_id uuid not null references mhistree.accounts(id), body jsonb not null, state text not null, recorded_at timestamptz not null default clock_timestamp(),unique(work_id,version)
);
alter table mhistree.clinical_work enable row level security;
alter table mhistree.clinical_work_versions enable row level security;
create function mhistree.can_work(p_patient uuid,p_author uuid,p_context text,p_org uuid,p_category text,p_team uuid[],p_write boolean) returns boolean language sql security definer set search_path='' as $$
select mhistree.can_access(p_patient,p_patient,p_category,'private',p_author,p_context,case when p_write then 'write' else 'read' end,p_org)
or (p_org is not null and exists(select 1 from mhistree.sessions s join mhistree.accounts a on a.id=s.account_id where s.digest=current_setting('mhistree.session',true) and a.id=any(p_team) and mhistree.can_access(p_patient,p_patient,p_category,'finalized',a.id,p_context,case when p_write then 'write' else 'read' end,p_org)));
$$;
revoke all on function mhistree.can_work(uuid,uuid,text,uuid,text,uuid[],boolean) from public;
grant execute on function mhistree.can_work(uuid,uuid,text,uuid,text,uuid[],boolean) to mhistree_runtime;
create policy clinical_work_read on mhistree.clinical_work for select to mhistree_runtime using(mhistree.can_work(patient_person_id,author_account_id,original_context,organization_id,category,team_account_ids,false));
create policy clinical_work_insert on mhistree.clinical_work for insert to mhistree_runtime with check(mhistree.is_session_actor(author_account_id) and mhistree.can_work(patient_person_id,author_account_id,original_context,organization_id,category,team_account_ids,true));
create policy clinical_work_update on mhistree.clinical_work for update to mhistree_runtime using(mhistree.can_work(patient_person_id,author_account_id,original_context,organization_id,category,team_account_ids,true)) with check(mhistree.can_work(patient_person_id,author_account_id,original_context,organization_id,category,team_account_ids,true));
create policy work_version_read on mhistree.clinical_work_versions for select to mhistree_runtime using(exists(select 1 from mhistree.clinical_work w where w.id=work_id));
create policy work_version_insert on mhistree.clinical_work_versions for insert to mhistree_runtime with check(mhistree.is_session_actor(actor_account_id) and exists(select 1 from mhistree.clinical_work w where w.id=work_id));
grant select,insert,update on mhistree.clinical_work to mhistree_runtime;
grant select,insert on mhistree.clinical_work_versions to mhistree_runtime;
grant usage on sequence mhistree.clinical_work_versions_id_seq to mhistree_runtime;
create trigger work_versions_immutable before update or delete on mhistree.clinical_work_versions for each row execute function mhistree.prevent_history_rewrite();
create function mhistree.pause_clinical_work() returns trigger language plpgsql security definer set search_path='' as $$ begin
if old.status='active' and (new.status<>'active' or new.revision<>old.revision) then update mhistree.clinical_work set state='paused',version=version+1,updated_at=clock_timestamp() where connection_id=new.id and state='draft';end if;return new;end;$$;
create trigger connection_work_pause after update on mhistree.connections for each row execute function mhistree.pause_clinical_work();
create function mhistree.validate_work_origin() returns trigger language plpgsql set search_path='' as $$ begin
if tg_op='UPDATE' and (new.patient_person_id,new.author_account_id,new.connection_id,new.original_context,new.organization_id,new.kind,new.category,new.request_key) is distinct from (old.patient_person_id,old.author_account_id,old.connection_id,old.original_context,old.organization_id,old.kind,old.category,old.request_key) then raise exception 'WORK_ORIGIN_IMMUTABLE';end if;
if not exists(select 1 from mhistree.connections c where c.id=new.connection_id and c.patient_person_id=new.patient_person_id and new.original_context=c.kind||':'||c.id::text and c.organization_id is not distinct from new.organization_id) then raise exception 'WORK_ORIGIN_MISMATCH';end if;return new;end;$$;
create trigger work_origin before insert or update on mhistree.clinical_work for each row execute function mhistree.validate_work_origin();
