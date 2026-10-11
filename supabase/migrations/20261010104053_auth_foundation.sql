create table mhistree.auth_enrollments (
 person_id uuid primary key references mhistree.persons(id),
 login_identifier text not null unique,
 provider_subject text
);
create table mhistree.setup_credentials (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references mhistree.persons(id),
 purpose text not null check(purpose in ('activation','recovery')),
 digest text not null unique,
 expires_at timestamptz not null,
 state text not null default 'issued' check(state in ('issued','redeemed','replaced')),
 issuer_account_id uuid not null references mhistree.accounts(id),
 evidence_reference text not null,
 replaced_by uuid references mhistree.setup_credentials(id),
 created_at timestamptz not null default clock_timestamp()
);
create index setup_person_idx on mhistree.setup_credentials(person_id);
create table mhistree.setup_sessions (
 digest text primary key,
 credential_id uuid not null references mhistree.setup_credentials(id),
 expires_at timestamptz not null,
 used_at timestamptz
);
create index setup_session_credential_idx on mhistree.setup_sessions(credential_id);
create table mhistree.sessions (
 digest text primary key,
 id uuid not null unique default gen_random_uuid(),
 account_id uuid not null references mhistree.accounts(id),
 session_epoch integer not null,
 provider_session_id text not null,
 provider_token_digest text not null,
 expires_at timestamptz not null,
 retired_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index sessions_account_idx on mhistree.sessions(account_id);
create table mhistree.auth_reconciliation (
 person_id uuid primary key references mhistree.persons(id),
 operation text not null,
 pending boolean not null default true,
 updated_at timestamptz not null default clock_timestamp()
);
