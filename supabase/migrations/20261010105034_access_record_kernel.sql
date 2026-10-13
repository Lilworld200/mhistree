create table mhistree.professionals (
 account_id uuid primary key references mhistree.accounts(id),
 status text not null check(status in ('pending','approved','rejected','suspended')),
 privileges text[] not null default '{}'
);
create table mhistree.organizations (
 id uuid primary key default gen_random_uuid(),
 status text not null check(status in ('pending','approved','rejected','suspended'))
);
create table mhistree.memberships (
 organization_id uuid not null references mhistree.organizations(id),
 account_id uuid not null references mhistree.accounts(id),
 active boolean not null,
 privileges text[] not null default '{}',
 primary key(organization_id,account_id)
);
create table mhistree.connections (
 id uuid primary key default gen_random_uuid(), patient_person_id uuid not null references mhistree.persons(id),
 kind text not null check(kind in ('direct','organization')),
 practitioner_account_id uuid references mhistree.accounts(id), organization_id uuid references mhistree.organizations(id),
 status text not null check(status in ('active','revoked')), revision integer not null default 1,
 check((kind='direct' and practitioner_account_id is not null and organization_id is null) or (kind='organization' and organization_id is not null and practitioner_account_id is null))
);
create index connections_patient_idx on mhistree.connections(patient_person_id);
create table mhistree.consents (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references mhistree.connections(id),
 categories text[] not null, exclusions text[] not null default '{}', origin_person_ids uuid[] not null, origin_context_ids text[] not null,
 method text not null check(method in ('login','in-person')),
 responsible_account_id uuid not null references mhistree.accounts(id), evidence_reference text,
 predecessor_id uuid references mhistree.consents(id), recorded_at timestamptz not null default clock_timestamp(),
 check(method<>'in-person' or evidence_reference is not null)
);
create index consents_connection_time_idx on mhistree.consents(connection_id,recorded_at desc,id);
create trigger consent_immutable before update or delete on mhistree.consents for each row execute function mhistree.prevent_history_rewrite();
create table mhistree.assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references mhistree.organizations(id),
 patient_person_id uuid not null references mhistree.persons(id), account_id uuid not null references mhistree.accounts(id),
 active boolean not null, categories text[] not null
);
create index assignments_patient_account_idx on mhistree.assignments(patient_person_id,account_id);
create table mhistree.initial_care_bases (
 id uuid primary key default gen_random_uuid(), patient_person_id uuid not null references mhistree.persons(id),
 account_id uuid not null references mhistree.accounts(id), organization_id uuid references mhistree.organizations(id),
 assignment_id uuid references mhistree.assignments(id), categories text[] not null,
 origin_context text not null, evidence_reference text not null, active boolean not null
);

create function mhistree.can_access(p_patient uuid,p_origin uuid,p_category text,p_visibility text,p_author uuid,p_origin_context text,p_operation text,p_origin_org uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a record; s jsonb; c record; consent record; assignment record; professional record; member record; org record; basis record; expected_context text;
begin
 if p_operation not in ('read','write') then return false; end if;
 select ac.id,ac.person_id into a from mhistree.sessions se join mhistree.accounts ac on ac.id=se.account_id
 where se.digest=current_setting('mhistree.session',true) and se.retired_at is null and se.expires_at>clock_timestamp()
 and ac.status='active' and ac.session_epoch=se.session_epoch for share of se,ac;
 if not found then return false; end if;
 s:=nullif(current_setting('mhistree.context',true),'')::jsonb;
 if s is null then return false; end if;
 if s->>'kind'='patient' then
   return a.person_id=p_patient and p_visibility='finalized' and (p_operation='read' or
     (p_author=a.id and p_origin=p_patient and p_origin_context='patient:'||a.id::text and p_origin_org is null and p_category in ('symptom','activity','medication-use','allergy','baseline','ongoing','document')));
 end if;
 select * into professional from mhistree.professionals where account_id=a.id for share;
 if not found or professional.status<>'approved' then return false; end if;
 if p_operation='write' and p_author<>a.id then return false; end if;
 if not (case when p_operation='write' then 'records.write' else 'records.read' end)=any(professional.privileges) then return false; end if;
 if s->>'kind'='initial-care' then
   select * into basis from mhistree.initial_care_bases where id=(s->>'basisId')::uuid and account_id=a.id and patient_person_id=p_patient for share;
   if not found or not basis.active or not p_category=any(basis.categories) or p_origin<>p_patient or p_origin_context<>basis.origin_context or basis.organization_id is distinct from p_origin_org then return false; end if;
   expected_context:=basis.origin_context;
   if exists(select 1 from mhistree.accounts where person_id=p_patient and status='active') then return false; end if;
   if not exists(select 1 from mhistree.staff_authorities where account_id=a.id and context_id=basis.origin_context and active and 'person.register'=any(privileges)) then return false; end if;
   if basis.organization_id is null then
     return p_visibility='finalized' or p_author=a.id;
   end if;
   if basis.organization_id::text is distinct from s->>'organizationId' or basis.assignment_id::text is distinct from s->>'assignmentId' then return false; end if;
 else
   select * into c from mhistree.connections where id=(s->>'connectionId')::uuid and patient_person_id=p_patient for share;
   if not found or c.status<>'active' or c.kind<>s->>'kind' then return false; end if;
   select * into consent from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1;
   if not found or not p_category=any(consent.categories) or p_category=any(consent.exclusions) or not p_origin=any(consent.origin_person_ids)
      or not ('*'=any(consent.origin_context_ids) or p_origin_context=any(consent.origin_context_ids)) then return false; end if;
   if c.kind='direct' then
     if c.practitioner_account_id<>a.id then return false; end if;
     if p_operation='write' and (p_author<>a.id or p_origin_context<>'direct:'||c.id::text or p_origin_org is not null) then return false; end if;
     return p_visibility='finalized' or (p_author=a.id and p_origin_context='direct:'||c.id::text);
   end if;
   if c.organization_id::text is distinct from s->>'organizationId' then return false; end if;
   expected_context:='organization:'||c.id::text;
 end if;
 select * into org from mhistree.organizations where id=(s->>'organizationId')::uuid for share;
 if not found or org.status<>'approved' then return false; end if;
 select * into member from mhistree.memberships where organization_id=org.id and account_id=a.id for share;
 if not found or not member.active or not (case when p_operation='write' then 'records.write' else 'records.read' end)=any(member.privileges) then return false; end if;
 select * into assignment from mhistree.assignments where id=(s->>'assignmentId')::uuid and organization_id=org.id and account_id=a.id and patient_person_id=p_patient for share;
 if not found or not assignment.active or not p_category=any(assignment.categories) then return false; end if;
 if p_operation='write' and (p_author<>a.id or p_origin_org is distinct from org.id or (s->>'kind'='organization' and p_origin_context<>'organization:'||c.id::text)) then return false; end if;
 return p_visibility='finalized' or (p_author=a.id and p_origin_context=expected_context);
exception when invalid_text_representation then return false;
end;
$$;

create table mhistree.sources (
 id uuid primary key default gen_random_uuid(), version integer not null default 1 check(version>0),
 patient_person_id uuid not null references mhistree.persons(id), origin_person_id uuid not null references mhistree.persons(id),
 author_account_id uuid not null references mhistree.accounts(id), original_context text not null, original_organization_id uuid references mhistree.organizations(id),
 category text not null, visibility text not null check(visibility in ('finalized','draft','private')),
 source_status text not null check(source_status in ('patient-reported','patient-uploaded','professional-finalized','professional-draft')),
 captured_at timestamptz not null default clock_timestamp(), source_timezone text not null,
 content text not null, client_key uuid not null,
 unique(author_account_id,client_key), unique(id,version)
);
create index sources_patient_idx on mhistree.sources(patient_person_id,captured_at desc);
create table mhistree.contributions (
 id uuid primary key default gen_random_uuid(), logical_id uuid not null, version integer not null check(version>0),
 patient_person_id uuid not null references mhistree.persons(id), origin_person_id uuid not null references mhistree.persons(id),
 source_id uuid not null, source_version integer not null, source_item_id text not null, operation_kind text not null,
 author_account_id uuid not null references mhistree.accounts(id), original_context text not null, original_organization_id uuid references mhistree.organizations(id),
 category text not null, visibility text not null check(visibility in ('finalized','draft','private')),
 source_status text not null check(source_status in ('patient-reported','patient-uploaded','professional-finalized','professional-draft')),
 recorded_at timestamptz not null default clock_timestamp(), occurred_at jsonb not null, source_timezone text not null,
 body jsonb not null, source_spans text[] not null, status text not null check(status in ('active','resolved','recurrent','unknown')),
 supersedes_id uuid references mhistree.contributions(id),
 foreign key(source_id,source_version) references mhistree.sources(id,version),
 unique(logical_id,version), unique(source_id,source_version,source_item_id,operation_kind)
);
create index contributions_patient_time_idx on mhistree.contributions(patient_person_id,recorded_at desc,id);
create table mhistree.record_heads (
 logical_id uuid primary key, current_id uuid not null references mhistree.contributions(id), version integer not null
);
create table mhistree.persistent_state (
 logical_id uuid primary key references mhistree.record_heads(logical_id), event_id uuid not null references mhistree.contributions(id),
 category text not null, status text not null, body jsonb not null
);
create table mhistree.record_operations (
 operation_key uuid primary key, actor_account_id uuid not null references mhistree.accounts(id), context_id text not null,
 body_hash text not null, event_id uuid not null references mhistree.contributions(id)
);
create table mhistree.outbox (
 id uuid primary key default gen_random_uuid(), kind text not null, reference_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1, unique(kind,reference_id,revision)
);
create table mhistree.dependent_work (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references mhistree.connections(id),
 state text not null check(state in ('pending','paused','completed','cancelled')), paused_at timestamptz
);
create index dependent_work_connection_idx on mhistree.dependent_work(connection_id);

create trigger sources_immutable before update or delete on mhistree.sources for each row execute function mhistree.prevent_history_rewrite();
create trigger contributions_immutable before update or delete on mhistree.contributions for each row execute function mhistree.prevent_history_rewrite();
alter table mhistree.sources enable row level security;
alter table mhistree.contributions enable row level security;
alter table mhistree.record_heads enable row level security;
alter table mhistree.persistent_state enable row level security;
create policy source_read on mhistree.sources for select using(mhistree.can_access(patient_person_id,origin_person_id,category,visibility,author_account_id,original_context,'read',original_organization_id));
create policy source_write on mhistree.sources for insert with check(mhistree.can_access(patient_person_id,origin_person_id,category,visibility,author_account_id,original_context,'write',original_organization_id));
create policy contribution_read on mhistree.contributions for select using(mhistree.can_access(patient_person_id,origin_person_id,category,visibility,author_account_id,original_context,'read',original_organization_id));
create policy contribution_write on mhistree.contributions for insert with check(mhistree.can_access(patient_person_id,origin_person_id,category,visibility,author_account_id,original_context,'write',original_organization_id));
create policy head_access on mhistree.record_heads using(exists(select 1 from mhistree.contributions e where e.id=current_id)) with check(exists(select 1 from mhistree.contributions e where e.id=current_id));
create policy state_access on mhistree.persistent_state using(exists(select 1 from mhistree.contributions e where e.id=event_id)) with check(exists(select 1 from mhistree.contributions e where e.id=event_id));

-- Backend-only role. Never grant it to anon/authenticated or expose its credentials.
do $$ begin if not exists(select 1 from pg_roles where rolname='mhistree_runtime') then create role mhistree_runtime nologin nobypassrls; end if; end $$;
grant usage on schema mhistree to mhistree_runtime;
grant execute on function mhistree.can_access(uuid,uuid,text,text,uuid,text,text,uuid) to mhistree_runtime;
grant select on mhistree.connections,mhistree.sources,mhistree.contributions,mhistree.record_heads,mhistree.persistent_state,mhistree.record_operations to mhistree_runtime;
grant insert on mhistree.sources,mhistree.contributions,mhistree.audit_events,mhistree.outbox,mhistree.record_operations to mhistree_runtime;
grant insert,update on mhistree.record_heads,mhistree.persistent_state to mhistree_runtime;
grant usage on all sequences in schema mhistree to mhistree_runtime;
-- Only the definer policy reads/locks authority projections. Runtime cannot change
-- accounts, sessions, qualification, consent or membership through a clinical query.

create table mhistree.private_files (
 source_id uuid primary key references mhistree.sources(id), storage_key uuid not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), byte_length bigint not null check(byte_length>0)
);
alter table mhistree.private_files enable row level security;
create policy private_file_read on mhistree.private_files for select using(exists(select 1 from mhistree.sources s where s.id=source_id));
grant select on mhistree.private_files to mhistree_runtime;
create trigger private_file_immutable before update or delete on mhistree.private_files for each row execute function mhistree.prevent_history_rewrite();

create function mhistree.validate_contribution_origin() returns trigger language plpgsql security definer set search_path='' as $$
declare s mhistree.sources%rowtype;
begin
 select * into s from mhistree.sources where id=new.source_id and version=new.source_version;
 if not found or (new.patient_person_id,new.origin_person_id,new.author_account_id,new.original_context,new.original_organization_id,new.category,new.visibility,new.source_status,new.source_timezone)
   is distinct from (s.patient_person_id,s.origin_person_id,s.author_account_id,s.original_context,s.original_organization_id,s.category,s.visibility,s.source_status,s.source_timezone) then raise exception 'SOURCE_ORIGIN_MISMATCH'; end if;
 return new;
end;
$$;
create trigger contribution_source_guard before insert on mhistree.contributions for each row execute function mhistree.validate_contribution_origin();
create function mhistree.validate_state_projection() returns trigger language plpgsql security definer set search_path='' as $$
declare e mhistree.contributions%rowtype;
begin
 select * into e from mhistree.contributions where id=new.event_id;
 if not found or e.visibility<>'finalized' or (new.logical_id,new.category,new.status,new.body) is distinct from (e.logical_id,e.category,e.status,e.body) then raise exception 'STATE_EVENT_MISMATCH'; end if;
 return new;
end;
$$;
create trigger state_event_guard before insert or update on mhistree.persistent_state for each row execute function mhistree.validate_state_projection();
alter table mhistree.sources add constraint source_status_authority check (
 (original_context like 'patient:%' and source_status in ('patient-reported','patient-uploaded') and visibility='finalized') or
 (original_context not like 'patient:%' and source_status=case when visibility='finalized' then 'professional-finalized' else 'professional-draft' end)
);
