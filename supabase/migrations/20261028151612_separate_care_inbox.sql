-- New messages only. Existing care transcripts and combined-view placement history remain retained.
alter table mhistree.care_messages add column sender_context jsonb;
alter table mhistree.medication_recommendations add column reviewed_event_id uuid references mhistree.contributions(id);
grant update(reviewed_event_id) on mhistree.medication_recommendations to mhistree_runtime;
create table mhistree.care_analysis_jobs (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null unique references mhistree.care_messages(id),
 account_id uuid not null references mhistree.accounts(id),
 patient_person_id uuid not null references mhistree.persons(id),
 connection_id uuid not null references mhistree.connections(id),
 acting_context jsonb not null,
 connection_revision integer not null,
 state text not null default 'queued' check(state in ('queued','running','completed','partial','failed','paused')),
 lease_id uuid, lease_until timestamptz,
 attempts integer not null default 0,
 output jsonb, issue text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index care_analysis_pending on mhistree.care_analysis_jobs(account_id,connection_id,state,created_at,id);
create table mhistree.care_pending_findings (
 id uuid primary key,
 job_id uuid not null references mhistree.care_analysis_jobs(id),
 message_id uuid not null references mhistree.care_messages(id),
 account_id uuid not null references mhistree.accounts(id),
 patient_person_id uuid not null references mhistree.persons(id),
 connection_id uuid not null references mhistree.connections(id),
 acting_context jsonb not null,
 chat_scope text not null,
 category text not null check(category in ('clinical','symptom','activity','medication-use','prescription','allergy','ongoing','baseline')),
 proposal jsonb not null check(proposal->>'category'=category and proposal->>'id'=id::text),
 state text not null default 'pending' check(state in ('pending','reviewing','recorded','private','dismissed','paused')),
 version integer not null default 1,
 review_run_id uuid references mhistree.practitioner_ai_runs(id),
 created_at timestamptz not null default clock_timestamp()
);
create index care_findings_author on mhistree.care_pending_findings(account_id,connection_id,state,created_at,id);
alter table mhistree.care_analysis_jobs enable row level security;
alter table mhistree.care_pending_findings enable row level security;
create policy own_care_analysis on mhistree.care_analysis_jobs to mhistree_runtime
 using(mhistree.is_session_actor(account_id) and acting_context=current_setting('mhistree.context',true)::jsonb and mhistree.can_participate(connection_id,'messages.send'))
 with check(mhistree.is_session_actor(account_id) and acting_context=current_setting('mhistree.context',true)::jsonb and mhistree.can_participate(connection_id,'messages.send') and exists(select 1 from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where m.id=message_id and m.author_account_id=account_id and t.connection_id=care_analysis_jobs.connection_id and t.patient_person_id=care_analysis_jobs.patient_person_id));
create policy own_care_findings on mhistree.care_pending_findings to mhistree_runtime
 using(mhistree.is_session_actor(account_id) and acting_context=current_setting('mhistree.context',true)::jsonb and mhistree.can_participate(connection_id,'messages.send') and mhistree.can_access(patient_person_id,patient_person_id,category,'private',account_id,(acting_context->>'kind')||':'||connection_id::text,'write',nullif(acting_context->>'organizationId','')::uuid))
 with check(mhistree.is_session_actor(account_id) and acting_context=current_setting('mhistree.context',true)::jsonb and mhistree.can_participate(connection_id,'messages.send') and mhistree.can_access(patient_person_id,patient_person_id,category,'private',account_id,(acting_context->>'kind')||':'||connection_id::text,'write',nullif(acting_context->>'organizationId','')::uuid) and exists(select 1 from mhistree.care_analysis_jobs j where j.id=job_id and j.message_id=care_pending_findings.message_id and j.account_id=care_pending_findings.account_id and j.patient_person_id=care_pending_findings.patient_person_id and j.connection_id=care_pending_findings.connection_id));
revoke all on mhistree.care_analysis_jobs,mhistree.care_pending_findings from public;
grant select,insert on mhistree.care_analysis_jobs,mhistree.care_pending_findings to mhistree_runtime;
grant update(state,lease_id,lease_until,attempts,output,issue,updated_at) on mhistree.care_analysis_jobs to mhistree_runtime;
grant update(state,version,review_run_id,proposal) on mhistree.care_pending_findings to mhistree_runtime;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on mhistree.care_analysis_jobs,mhistree.care_pending_findings from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on mhistree.care_analysis_jobs,mhistree.care_pending_findings from authenticated; end if;
end $$;

-- Patient disposition/use updates cannot claim that a practitioner reviewed a record.
create function mhistree.guard_reviewed_inbox_recommendation() returns trigger language plpgsql set search_path=pg_catalog,mhistree as $$
begin
 if (tg_op='INSERT' and new.reviewed_event_id is not null) or (tg_op='UPDATE' and old.reviewed_event_id is distinct from new.reviewed_event_id) then
  if not mhistree.is_session_actor(new.author_account_id) or (current_setting('mhistree.context',true)::jsonb->>'kind') not in ('direct','organization') or (new.reviewed_event_id is not null and not exists(select 1 from mhistree.contributions e where e.id=new.reviewed_event_id and e.patient_person_id=new.patient_person_id and e.author_account_id=new.author_account_id and e.category='prescription' and e.visibility='finalized')) then
   raise exception using errcode='42501',message='Reviewed prescription link requires its current practitioner author';
  end if;
 end if;
 return new;
end $$;
revoke all on function mhistree.guard_reviewed_inbox_recommendation() from public;
grant execute on function mhistree.guard_reviewed_inbox_recommendation() to mhistree_runtime;
create trigger reviewed_inbox_recommendation before insert or update on mhistree.medication_recommendations for each row execute function mhistree.guard_reviewed_inbox_recommendation();
