-- Self enrollment is distinct from staff-issued identity claims.
alter table mhistree.setup_credentials alter column issuer_account_id drop not null;
create table mhistree.self_enrollments (
 request_digest text primary key,
 person_id uuid not null references mhistree.persons(id),
 credential_id uuid not null references mhistree.setup_credentials(id),
 body_digest text not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.persons add column profile_version integer not null default 1;
