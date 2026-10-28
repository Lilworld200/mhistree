-- Additive workflow metadata; canonical care messages and clinical records remain separate.
alter table mhistree.care_messages add column summary_attachment jsonb;
alter table mhistree.care_messages add column origin_conversation_id uuid references mhistree.conversations(id);
alter table mhistree.chat_care_deliveries add column reviewed_summary jsonb;
create table mhistree.chat_care_activity (
 account_id uuid not null references mhistree.accounts(id),
 view_id uuid not null,
 conversation_id uuid not null references mhistree.conversations(id),
 visible_until timestamptz not null default clock_timestamp()+interval '45 seconds',
 active_at timestamptz not null default clock_timestamp(),
 primary key(account_id,view_id)
);
create table mhistree.chat_care_placements (
 message_id uuid primary key references mhistree.care_messages(id),
 account_id uuid not null references mhistree.accounts(id),
 conversation_id uuid not null references mhistree.conversations(id),
 placed_at timestamptz not null default clock_timestamp()
);
create index chat_care_placement_session on mhistree.chat_care_placements(conversation_id,placed_at,message_id);
create table mhistree.care_presence (
 connection_id uuid not null references mhistree.connections(id),
 account_id uuid not null references mhistree.accounts(id),
 expires_at timestamptz not null,
 participant_kind text not null check(participant_kind in ('patient','practitioner')),
 primary key(connection_id,account_id)
);
create table mhistree.medication_recommendations (
 id uuid primary key default gen_random_uuid(),
 patient_person_id uuid not null references mhistree.persons(id),
 author_account_id uuid not null references mhistree.accounts(id),
 connection_id uuid not null references mhistree.connections(id),
 source_message_id uuid references mhistree.care_messages(id),
 source_event_id uuid references mhistree.contributions(id),
 name text not null check(length(name) between 1 and 200),
 details text not null check(length(details) between 1 and 2000),
 state text not null default 'pending' check(state in ('pending','planned','taking','stopped','declined','dismissed','withdrawn')),
 planned_start date,
 commitment_message_id uuid references mhistree.chat_messages(id),
 latest_event_id uuid references mhistree.contributions(id),
 version integer not null default 1,
 unique(source_message_id,name),
 unique(source_event_id,name),
 check((source_message_id is null) <> (source_event_id is null))
);
create table mhistree.medication_followups (
 recommendation_id uuid not null references mhistree.medication_recommendations(id),
 local_date date not null,
 reply_message_id uuid not null references mhistree.chat_messages(id),
 question text not null,
 primary key(recommendation_id,local_date)
);
alter table mhistree.chat_care_activity enable row level security;
alter table mhistree.chat_care_placements enable row level security;
alter table mhistree.care_presence enable row level security;
alter table mhistree.medication_recommendations enable row level security;
alter table mhistree.medication_followups enable row level security;
create policy own_care_activity on mhistree.chat_care_activity to mhistree_runtime
 using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id) and exists(select 1 from mhistree.conversations c where c.id=conversation_id and c.account_id=chat_care_activity.account_id));
create policy own_care_placement on mhistree.chat_care_placements to mhistree_runtime
 using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id) and exists(select 1 from mhistree.conversations c where c.id=conversation_id and c.account_id=chat_care_placements.account_id) and exists(select 1 from mhistree.care_messages m where m.id=message_id));
create policy scoped_care_presence on mhistree.care_presence for select to mhistree_runtime using(mhistree.can_participate(connection_id,'messages.send'));
create policy own_care_presence_insert on mhistree.care_presence for insert to mhistree_runtime with check(mhistree.is_session_actor(account_id) and mhistree.can_participate(connection_id,'messages.send'));
create policy own_care_presence_update on mhistree.care_presence for update to mhistree_runtime using(mhistree.is_session_actor(account_id) and mhistree.can_participate(connection_id,'messages.send')) with check(mhistree.is_session_actor(account_id) and mhistree.can_participate(connection_id,'messages.send'));
create policy recommendation_read on mhistree.medication_recommendations for select to mhistree_runtime using(mhistree.owns_patient_person(patient_person_id) or (mhistree.can_access(patient_person_id,patient_person_id,'prescription','finalized',author_account_id,(select c.kind||':'||c.id::text from mhistree.connections c where c.id=connection_id),'read',(select c.organization_id from mhistree.connections c where c.id=connection_id))));
create policy recommendation_insert on mhistree.medication_recommendations for insert to mhistree_runtime with check(mhistree.is_session_actor(author_account_id) and (source_message_id is null or mhistree.can_participate(connection_id,'messages.send')) and mhistree.can_access(patient_person_id,patient_person_id,'prescription','finalized',author_account_id,(select c.kind||':'||c.id::text from mhistree.connections c where c.id=connection_id),'write',(select c.organization_id from mhistree.connections c where c.id=connection_id)));
create policy recommendation_update on mhistree.medication_recommendations for update to mhistree_runtime using(mhistree.owns_patient_person(patient_person_id)) with check(mhistree.owns_patient_person(patient_person_id));
create policy own_medication_followup on mhistree.medication_followups to mhistree_runtime using(exists(select 1 from mhistree.medication_recommendations r where r.id=recommendation_id and mhistree.owns_patient_person(r.patient_person_id))) with check(exists(select 1 from mhistree.medication_recommendations r where r.id=recommendation_id and mhistree.owns_patient_person(r.patient_person_id)));
revoke all on mhistree.chat_care_activity,mhistree.chat_care_placements,mhistree.care_presence,mhistree.medication_recommendations,mhistree.medication_followups from public;
grant select,insert,update on mhistree.chat_care_activity,mhistree.care_presence,mhistree.medication_recommendations to mhistree_runtime;
grant select,insert on mhistree.chat_care_placements,mhistree.medication_followups to mhistree_runtime;
do $$ declare r text; begin foreach r in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on mhistree.chat_care_activity,mhistree.chat_care_placements,mhistree.care_presence,mhistree.medication_recommendations,mhistree.medication_followups from %I',r); end if;
end loop; end $$;
create table mhistree.care_clinical_attachments (
 message_id uuid not null references mhistree.care_messages(id),
 event_id uuid not null references mhistree.contributions(id),
 author_account_id uuid not null references mhistree.accounts(id),
 primary key(message_id,event_id)
);
alter table mhistree.care_clinical_attachments enable row level security;
create policy care_clinical_attachment_read on mhistree.care_clinical_attachments for select to mhistree_runtime using(exists(select 1 from mhistree.care_messages m where m.id=message_id) and exists(select 1 from mhistree.contributions e where e.id=event_id));
create policy care_clinical_attachment_insert on mhistree.care_clinical_attachments for insert to mhistree_runtime with check(mhistree.is_session_actor(author_account_id) and exists(select 1 from mhistree.care_messages m where m.id=message_id and m.author_account_id=care_clinical_attachments.author_account_id) and exists(select 1 from mhistree.contributions e where e.id=event_id and e.author_account_id=care_clinical_attachments.author_account_id));
revoke all on mhistree.care_clinical_attachments from public;
grant select,insert on mhistree.care_clinical_attachments to mhistree_runtime;
do $$ begin if exists(select 1 from pg_roles where rolname='anon') then revoke all on mhistree.care_clinical_attachments from anon; end if; if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on mhistree.care_clinical_attachments from authenticated; end if; end $$;
create table mhistree.medication_commitments (
 message_id uuid primary key references mhistree.chat_messages(id),
 recommendation_id uuid not null references mhistree.medication_recommendations(id),
 event_id uuid references mhistree.contributions(id)
);
alter table mhistree.medication_commitments enable row level security;
create policy own_medication_commitment on mhistree.medication_commitments to mhistree_runtime using(exists(select 1 from mhistree.chat_messages m where m.id=message_id and mhistree.owns_patient_account(m.account_id))) with check(exists(select 1 from mhistree.chat_messages m where m.id=message_id and mhistree.owns_patient_account(m.account_id)));
revoke all on mhistree.medication_commitments from public;
grant select,insert on mhistree.medication_commitments to mhistree_runtime;
do $$ begin if exists(select 1 from pg_roles where rolname='anon') then revoke all on mhistree.medication_commitments from anon; end if; if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on mhistree.medication_commitments from authenticated; end if; end $$;
create policy practitioner_recommendation_update on mhistree.medication_recommendations for update to mhistree_runtime using(mhistree.can_access(patient_person_id,patient_person_id,'medication-use','finalized',author_account_id,(select c.kind||':'||c.id::text from mhistree.connections c where c.id=connection_id),'write',(select c.organization_id from mhistree.connections c where c.id=connection_id))) with check(mhistree.can_access(patient_person_id,patient_person_id,'medication-use','finalized',author_account_id,(select c.kind||':'||c.id::text from mhistree.connections c where c.id=connection_id),'write',(select c.organization_id from mhistree.connections c where c.id=connection_id)));
create policy author_recommendation_update on mhistree.medication_recommendations for update to mhistree_runtime using(mhistree.is_session_actor(author_account_id) and mhistree.can_participate(connection_id,'messages.send') and mhistree.can_access(patient_person_id,patient_person_id,'prescription','finalized',author_account_id,(select c.kind||':'||c.id::text from mhistree.connections c where c.id=connection_id),'write',(select c.organization_id from mhistree.connections c where c.id=connection_id))) with check(mhistree.is_session_actor(author_account_id) and mhistree.can_participate(connection_id,'messages.send') and mhistree.can_access(patient_person_id,patient_person_id,'prescription','finalized',author_account_id,(select c.kind||':'||c.id::text from mhistree.connections c where c.id=connection_id),'write',(select c.organization_id from mhistree.connections c where c.id=connection_id)));
alter table mhistree.care_messages add column input_method text not null default 'text' check(input_method in ('text','microphone'));
alter table mhistree.care_messages add column transcription jsonb;
create unique index care_transcript_once on mhistree.care_messages((transcription->>'id')) where transcription is not null;
-- A handoff checkpoint survives replacement of the private live session summary.
create table mhistree.chat_handoff_preparations (
 conversation_id uuid not null references mhistree.conversations(id),
 through_sequence bigint not null,
 source_fingerprint text not null,
 source_ids uuid[] not null,
 primary key(conversation_id,through_sequence,source_fingerprint)
);
alter table mhistree.chat_handoff_preparations enable row level security;
create policy own_handoff_preparation on mhistree.chat_handoff_preparations to mhistree_runtime using(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id))) with check(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)));
revoke all on mhistree.chat_handoff_preparations from public;
grant select,insert on mhistree.chat_handoff_preparations to mhistree_runtime;
do $$ begin if exists(select 1 from pg_roles where rolname='anon') then revoke all on mhistree.chat_handoff_preparations from anon; end if; if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on mhistree.chat_handoff_preparations from authenticated; end if; end $$;

create index medication_recommendation_patient_state on mhistree.medication_recommendations(patient_person_id,state,id);
create index medication_followup_day on mhistree.medication_followups(local_date,recommendation_id);
create index chat_care_activity_visible on mhistree.chat_care_activity(account_id,visible_until,active_at desc);
create index care_message_originating on mhistree.care_messages(thread_id,sequence) where origin_conversation_id is not null;
-- Original recommendation identity, author and source references are immutable.
revoke update on mhistree.medication_recommendations from mhistree_runtime;
grant update(state,planned_start,commitment_message_id,latest_event_id,version) on mhistree.medication_recommendations to mhistree_runtime;
-- Patient-authored direct-care reports retain their canonical source and clock.
alter table mhistree.care_messages add column timezone text not null default 'unknown';
alter table mhistree.sources add column care_message_id uuid references mhistree.care_messages(id);
alter table mhistree.medication_recommendations add column commitment_care_message_id uuid references mhistree.care_messages(id);
grant update(commitment_care_message_id) on mhistree.medication_recommendations to mhistree_runtime;
alter table mhistree.medication_commitments drop constraint medication_commitments_message_id_fkey;
alter table mhistree.medication_commitments add column chat_message_id uuid references mhistree.chat_messages(id);
alter table mhistree.medication_commitments add column care_message_id uuid references mhistree.care_messages(id);
alter table mhistree.medication_commitments add column question_care_message_id uuid references mhistree.care_messages(id);
-- No historical backfill: this additive migration introduces the table above.
alter table mhistree.medication_commitments add constraint medication_commitment_source check((chat_message_id is null)<>(care_message_id is null) and message_id=coalesce(chat_message_id,care_message_id));
drop policy own_medication_commitment on mhistree.medication_commitments;
create policy own_medication_commitment on mhistree.medication_commitments to mhistree_runtime
 using(exists(select 1 from mhistree.medication_recommendations r where r.id=recommendation_id and mhistree.owns_patient_person(r.patient_person_id)))
 with check(exists(select 1 from mhistree.medication_recommendations r where r.id=recommendation_id and mhistree.owns_patient_person(r.patient_person_id)) and
 (exists(select 1 from mhistree.chat_messages m where m.id=chat_message_id and mhistree.owns_patient_account(m.account_id)) or exists(select 1 from mhistree.care_messages m where m.id=care_message_id and mhistree.owns_patient_account(m.author_account_id))));
alter table mhistree.care_messages add column reply_to uuid references mhistree.care_messages(id);
-- Recommendation disposition and patient use remain independent, including later resumption.
alter table mhistree.medication_recommendations add column use_state text check(use_state in ('planned','taking','stopped','not-started'));
alter table mhistree.medication_recommendations add column disposition text check(disposition in ('declined','dismissed','withdrawn'));
alter table mhistree.medication_recommendations add column followups_closed boolean not null default false;
grant update(use_state,disposition,followups_closed) on mhistree.medication_recommendations to mhistree_runtime;
