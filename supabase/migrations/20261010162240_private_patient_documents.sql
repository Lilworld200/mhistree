create table mhistree.documents (
 source_id uuid primary key references mhistree.sources(id),
 account_id uuid not null references mhistree.accounts(id),
 filename text not null,mime_type text not null,
 status text not null check(status in ('quarantined','queued','parsing','parsed','failed')),
 attempts integer not null default 0,
 lease_id uuid,lease_until timestamptz,
 pages jsonb,error_code text,
 created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.documents enable row level security;
create policy document_owner on mhistree.documents to mhistree_runtime using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id));
grant select,insert,update on mhistree.documents to mhistree_runtime;
create policy private_file_insert on mhistree.private_files for insert to mhistree_runtime with check(exists(select 1 from mhistree.sources s where s.id=source_id and mhistree.owns_patient_account(s.author_account_id)));
grant insert on mhistree.private_files to mhistree_runtime;
