alter table mhistree.sources add column chat_message_id uuid references mhistree.chat_messages(id);
alter table mhistree.sources add column parent_source_id uuid references mhistree.sources(id);
create table mhistree.extraction_jobs (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references mhistree.accounts(id),
 message_id uuid unique references mhistree.chat_messages(id),
 document_source_id uuid unique references mhistree.sources(id),
 state text not null default 'queued' check(state in ('queued','running','partial','succeeded','failed','held')),
 attempts integer not null default 0,
 lease_id uuid,lease_until timestamptz,
 output jsonb,
 issues jsonb not null default '[]',
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check(num_nonnulls(message_id,document_source_id)=1)
);
create index extraction_owner_idx on mhistree.extraction_jobs(account_id,created_at);
alter table mhistree.extraction_jobs enable row level security;
create policy extraction_owner on mhistree.extraction_jobs to mhistree_runtime using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id));
grant select,insert,update on mhistree.extraction_jobs to mhistree_runtime;
