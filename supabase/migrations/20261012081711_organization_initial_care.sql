alter table mhistree.clinical_work alter column connection_id drop not null;
alter table mhistree.clinical_work add column initial_care_basis_id uuid references mhistree.initial_care_bases(id);
alter table mhistree.clinical_work add constraint work_basis_exclusive check((connection_id is null) <> (initial_care_basis_id is null));
grant select on mhistree.initial_care_bases to mhistree_runtime;
alter table mhistree.initial_care_bases enable row level security;
create policy initial_basis_owner on mhistree.initial_care_bases for select to mhistree_runtime using(mhistree.is_session_actor(account_id));
create or replace function mhistree.validate_work_origin() returns trigger language plpgsql set search_path='' as $$ begin
if tg_op='UPDATE' and (new.patient_person_id,new.author_account_id,new.connection_id,new.initial_care_basis_id,new.original_context,new.organization_id,new.kind,new.category,new.request_key) is distinct from (old.patient_person_id,old.author_account_id,old.connection_id,old.initial_care_basis_id,old.original_context,old.organization_id,old.kind,old.category,old.request_key) then raise exception 'WORK_ORIGIN_IMMUTABLE';end if;
if new.connection_id is not null then
 if not exists(select 1 from mhistree.connections c where c.id=new.connection_id and c.patient_person_id=new.patient_person_id and new.original_context=c.kind||':'||c.id::text and c.organization_id is not distinct from new.organization_id) then raise exception 'WORK_ORIGIN_MISMATCH';end if;
else
 if not exists(select 1 from mhistree.initial_care_bases b where b.id=new.initial_care_basis_id and b.patient_person_id=new.patient_person_id and b.account_id=new.author_account_id and b.origin_context=new.original_context and b.organization_id is not distinct from new.organization_id) then raise exception 'WORK_ORIGIN_MISMATCH';end if;
end if;return new;end;$$;

create or replace function mhistree.valid_result_recipient(p_connection uuid,p_patient uuid,p_recipient uuid) returns boolean language sql security definer set search_path='' as $$
select exists(select 1 from mhistree.connections c join mhistree.professionals p on p.account_id=p_recipient join mhistree.accounts a on a.id=p.account_id join lateral(select * from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s on true
where c.id=p_connection and c.patient_person_id=p_patient and c.status='active' and p.status='approved' and a.status='active' and 'results.finalize'=any(p.privileges) and 'result'=any(s.categories) and not('result'=any(s.exclusions)) and p_patient=any(s.origin_person_ids) and ('*'=any(s.origin_context_ids) or c.kind||':'||c.id::text=any(s.origin_context_ids))
and ((c.kind='direct' and c.practitioner_account_id=p_recipient) or(c.kind='organization' and exists(select 1 from mhistree.organizations o join mhistree.memberships m on m.organization_id=o.id join mhistree.assignments ass on ass.organization_id=o.id and ass.account_id=m.account_id where o.id=c.organization_id and o.status='approved' and m.active and m.account_id=p_recipient and 'results.finalize'=any(m.privileges) and ass.active and ass.patient_person_id=p_patient and 'result'=any(ass.categories)))));
$$;
-- A typed null row is safe on the initial-care branch, which has no connection.
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
 where m.organization_id=c.organization_id and m.account_id=actor.id and m.active and p_privilege=any(m.privileges) and a.active and a.patient_person_id=c.patient_person_id and a.id::text=context->>'assignmentId' and exists(select 1 from (select categories,exclusions from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1) scope where exists(select 1 from unnest(a.categories) cat where cat=any(scope.categories) and not(cat=any(scope.exclusions)) and (p_privilege not in ('requests.read','requests.create','results.finalize') or cat='result'))));
exception when invalid_text_representation then return false;
end;$$;
