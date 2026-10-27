-- Private derived chat context. No clinical grants, historical backfill or patient-state writes.
create table mhistree.chat_memory_links (
 conversation_id uuid primary key references mhistree.conversations(id),
 previous_id uuid not null references mhistree.conversations(id),
 through_sequence bigint not null check(through_sequence>=0),
 prepared boolean not null default false,
 check(conversation_id<>previous_id)
);
create table mhistree.chat_memory_jobs (
 conversation_id uuid primary key references mhistree.conversations(id),
 covered_sequence bigint not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 check(covered_sequence>=0)
);
create table mhistree.chat_memory_chunks (
 id uuid primary key,
 conversation_id uuid not null references mhistree.conversations(id),
 from_sequence bigint not null,
 through_sequence bigint not null,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=16),
 source_fingerprint text not null,
 model text not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(conversation_id,through_sequence),
 check(through_sequence>=from_sequence)
);
create index chat_memory_recent on mhistree.chat_memory_chunks(created_at desc,id desc);
create index chat_memory_previous on mhistree.chat_memory_links(previous_id);
create index chat_memory_search on mhistree.chat_memory_chunks using gin(to_tsvector('simple',items::text));
create table mhistree.chat_titles (
 conversation_id uuid primary key references mhistree.conversations(id),
 title text check(length(title) between 1 and 64),
 lease_id uuid,
 lease_until timestamptz,
 through_sequence bigint,
 model text,
 updated_at timestamptz not null default clock_timestamp()
);
alter table mhistree.chat_memory_links enable row level security;
alter table mhistree.chat_memory_jobs enable row level security;
alter table mhistree.chat_memory_chunks enable row level security;
alter table mhistree.chat_titles enable row level security;
-- Explicit ownership, including when broader merged-history policies allow reading an old conversation.
create policy private_memory_link on mhistree.chat_memory_links to mhistree_runtime
 using(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)))
 with check(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id))
 and exists(select 1 from mhistree.conversations c where c.id=previous_id and mhistree.owns_patient_account(c.account_id)));
create policy private_memory_job on mhistree.chat_memory_jobs to mhistree_runtime
 using(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)))
 with check(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)));
create policy private_memory_chunk on mhistree.chat_memory_chunks to mhistree_runtime
 using(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)))
 with check(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)));
create policy private_chat_title on mhistree.chat_titles to mhistree_runtime
 using(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)))
 with check(exists(select 1 from mhistree.conversations c where c.id=conversation_id and mhistree.owns_patient_account(c.account_id)));
revoke all on mhistree.chat_memory_links,mhistree.chat_memory_jobs,mhistree.chat_memory_chunks,mhistree.chat_titles from public;
grant select,insert on mhistree.chat_memory_links,mhistree.chat_memory_chunks to mhistree_runtime;
grant update(prepared) on mhistree.chat_memory_links to mhistree_runtime;
grant select,insert,update on mhistree.chat_memory_jobs,mhistree.chat_titles to mhistree_runtime;

-- Local PostgreSQL fixtures do not have Supabase Data API roles.
do $$ declare api_role text; begin
 foreach api_role in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=api_role) then
   execute format('revoke all on mhistree.chat_memory_links,mhistree.chat_memory_jobs,mhistree.chat_memory_chunks,mhistree.chat_titles from %I',api_role);
  end if;
 end loop;
end $$;
