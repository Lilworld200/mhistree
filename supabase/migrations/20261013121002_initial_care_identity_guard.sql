-- Initial-care authority cannot survive retirement into a different canonical identity.
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
   if mhistree.canonical_person(p_patient) is distinct from p_patient or exists(select 1 from mhistree.accounts where person_id=p_patient and status='active') then return false; end if;
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
