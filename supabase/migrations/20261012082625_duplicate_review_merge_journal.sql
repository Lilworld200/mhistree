create table mhistree.duplicate_cases (
 id uuid primary key default gen_random_uuid(),left_person_id uuid not null references mhistree.persons(id),right_person_id uuid not null references mhistree.persons(id),
 reporter_account_id uuid not null references mhistree.accounts(id),reason text not null,state text not null default 'pending' check(state in ('pending','approved','rejected','escalated','merged','reversed')),
 version integer not null default 1,created_at timestamptz not null default clock_timestamp(),check(left_person_id<>right_person_id)
);
create table mhistree.duplicate_decisions (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references mhistree.duplicate_cases(id),reviewer_account_id uuid not null references mhistree.accounts(id),
 decision text not null,identity_evidence text not null,ownership_verified boolean not null,survivor_id uuid references mhistree.persons(id),snapshot jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mhistree.merge_journal (
 operation_id uuid primary key,case_id uuid not null unique references mhistree.duplicate_cases(id),decision_id uuid not null references mhistree.duplicate_decisions(id),
 survivor_id uuid not null references mhistree.persons(id),loser_id uuid not null references mhistree.persons(id),reviewer_account_id uuid not null references mhistree.accounts(id),
 before_state jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mhistree.merge_reversals (
 operation_id uuid primary key,merge_operation_id uuid not null unique references mhistree.merge_journal(operation_id),reviewer_account_id uuid not null references mhistree.accounts(id),
 evidence text not null,after_merge_inventory jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
alter table mhistree.duplicate_cases enable row level security;
alter table mhistree.duplicate_decisions enable row level security;
alter table mhistree.merge_journal enable row level security;
alter table mhistree.merge_reversals enable row level security;
create trigger duplicate_decisions_immutable before update or delete on mhistree.duplicate_decisions for each row execute function mhistree.prevent_history_rewrite();
create trigger merge_journal_immutable before update or delete on mhistree.merge_journal for each row execute function mhistree.prevent_history_rewrite();
create trigger merge_reversals_immutable before update or delete on mhistree.merge_reversals for each row execute function mhistree.prevent_history_rewrite();
create function mhistree.canonical_person(p_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 with recursive chain as(select id,canonical_person_id,array[id] visited from mhistree.persons where id=p_id union all select p.id,p.canonical_person_id,c.visited||p.id from mhistree.persons p join chain c on p.id=c.canonical_person_id where not p.id=any(c.visited)) select id from chain where canonical_person_id is null limit 1;
$$;
revoke all on function mhistree.canonical_person(uuid) from public;
grant execute on function mhistree.canonical_person(uuid) to mhistree_runtime;
create function mhistree.can_read_patient_account(p_account uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from mhistree.sessions s join mhistree.accounts a on a.id=s.account_id join mhistree.accounts original on original.id=p_account
 where s.digest=current_setting('mhistree.session',true) and a.status='active' and s.retired_at is null and s.expires_at>statement_timestamp() and s.session_epoch=a.session_epoch
 and current_setting('mhistree.context',true)::jsonb->>'kind'='patient' and mhistree.canonical_person(a.person_id)=mhistree.canonical_person(original.person_id));
$$;
revoke all on function mhistree.can_read_patient_account(uuid) from public;
grant execute on function mhistree.can_read_patient_account(uuid) to mhistree_runtime;
create policy conversation_merged_read on mhistree.conversations for select to mhistree_runtime using(mhistree.can_read_patient_account(account_id));
create policy message_merged_read on mhistree.chat_messages for select to mhistree_runtime using(mhistree.can_read_patient_account(account_id));
create or replace function mhistree.can_access(p_patient uuid,p_origin uuid,p_category text,p_visibility text,p_author uuid,p_origin_context text,p_operation text,p_origin_org uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a record; s jsonb; c mhistree.connections%rowtype; consent record; assignment record; professional record; member record; org record; basis record; expected_context text;
begin
 if p_operation not in ('read','write') then return false; end if;
 select ac.id,ac.person_id into a from mhistree.sessions se join mhistree.accounts ac on ac.id=se.account_id
 where se.digest=current_setting('mhistree.session',true) and se.retired_at is null and se.expires_at>clock_timestamp()
 and ac.status='active' and ac.session_epoch=se.session_epoch for share of se,ac;
 if not found then return false; end if;
 s:=nullif(current_setting('mhistree.context',true),'')::jsonb;
 if s is null then return false; end if;
 if s->>'kind'='patient' then
   return mhistree.canonical_person(a.person_id)=mhistree.canonical_person(p_patient) and p_visibility='finalized' and (p_operation='read' or
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
 if context->>'kind'='patient' then return p_privilege in ('appointments.manage','messages.send','requests.read') and mhistree.canonical_person(actor.person_id)=mhistree.canonical_person(c.patient_person_id);end if;
 if context->>'connectionId' is distinct from c.id::text or context->>'kind'<>c.kind then return false;end if;
 if not exists(select 1 from mhistree.professionals where account_id=actor.id and status='approved' and p_privilege=any(privileges)) then return false;end if;
 if c.kind='direct' then return c.practitioner_account_id=actor.id;end if;
 return context->>'organizationId'=c.organization_id::text and exists(select 1 from mhistree.memberships m join mhistree.assignments a on a.organization_id=m.organization_id and a.account_id=m.account_id
 where m.organization_id=c.organization_id and m.account_id=actor.id and m.active and p_privilege=any(m.privileges) and a.active and a.patient_person_id=c.patient_person_id and a.id::text=context->>'assignmentId' and exists(select 1 from (select categories,exclusions from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1) scope where exists(select 1 from unnest(a.categories) cat where cat=any(scope.categories) and not(cat=any(scope.exclusions)) and (p_privilege not in ('requests.read','requests.create','results.finalize') or cat='result'))));
exception when invalid_text_representation then return false;
end;$$;
