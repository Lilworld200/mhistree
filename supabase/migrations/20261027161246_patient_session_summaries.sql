-- One private replaceable snapshot per conversation; old chunks stay archived, never backfilled.
create table mhistree.chat_session_summaries (
 conversation_id uuid primary key references mhistree.conversations(id),
 through_sequence bigint not null check(through_sequence>=0),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=16),
 source_fingerprint text not null,
 model text not null,
 source_from timestamptz,
 source_through timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 bounded boolean not null default false
);
alter table mhistree.chat_session_summaries enable row level security;
create policy private_session_summary on mhistree.chat_session_summaries to mhistree_runtime
 using(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)))
 with check(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)));
revoke all on mhistree.chat_session_summaries from public;
grant select,insert,update on mhistree.chat_session_summaries to mhistree_runtime;
-- Navigation may depart into an older owned conversation. Links are context pointers, not recursive dependencies.
alter table mhistree.chat_memory_links add column target_sequence bigint not null default 0 check(target_sequence>=0);
grant update(previous_id,through_sequence,target_sequence,prepared) on mhistree.chat_memory_links to mhistree_runtime;
do $$ declare api_role text; begin
 foreach api_role in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=api_role) then
   execute format('revoke all on mhistree.chat_session_summaries from %I',api_role);
  end if;
 end loop;
end $$;
