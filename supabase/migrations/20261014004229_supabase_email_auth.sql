-- Pending provider identity binding; never exposed to the Data API.
alter table mhistree.accounts add column provider_valid_after timestamptz;
create table mhistree.email_confirmation_proofs (
 token_digest text primary key,
 created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.email_confirmation_proofs enable row level security;
create table mhistree.email_enrollments (
 request_digest text primary key,
 provider_subject uuid not null unique,
 email text not null,
 display_name text not null,
 birth_date date,
 target_person_id uuid references mhistree.persons(id),
 credential_id uuid references mhistree.setup_credentials(id),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '1 hour',
 completed_at timestamptz
);
alter table mhistree.email_enrollments enable row level security;
create table mhistree.email_recovery_proofs (
 token_digest text primary key,
 account_id uuid not null references mhistree.accounts(id),
 completed_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.email_recovery_proofs enable row level security;
create table mhistree.auth_provider_transitions (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references mhistree.accounts(id),
 old_provider text not null,
 old_subject text not null,
 new_provider text not null,
 new_subject text not null,
 credential_id uuid not null references mhistree.setup_credentials(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table mhistree.auth_provider_transitions enable row level security;
