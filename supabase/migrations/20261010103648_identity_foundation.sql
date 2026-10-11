-- Private server schema: never expose through PostgREST or browser credentials.
create schema mhistree;
revoke all on schema mhistree from public;
alter default privileges in schema mhistree revoke all on tables from public;
alter default privileges in schema mhistree revoke execute on functions from public;

create table mhistree.persons (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(display_name) between 1 and 200),
  birth_date date,
  identity_status text not null default 'provisional' check (identity_status in ('provisional','matched')),
  created_at timestamptz not null default clock_timestamp(),
  creator_account_id uuid,
  original_context text not null,
  original_organization_id uuid,
  canonical_person_id uuid references mhistree.persons(id),
  merge_operation_id uuid
);
create table mhistree.accounts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references mhistree.persons(id),
  provider text not null,
  provider_subject text not null,
  login_identifier text not null unique,
  status text not null check (status in ('setup','active','recovery-pending','retired')),
  session_epoch integer not null default 0,
  last_successful_patient_login_at timestamptz,
  unique(provider,provider_subject)
);
create index accounts_person_idx on mhistree.accounts(person_id);
create unique index accounts_live_person_idx on mhistree.accounts(person_id) where status <> 'retired';
alter table mhistree.persons add foreign key (creator_account_id) references mhistree.accounts(id);
create table mhistree.contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references mhistree.persons(id),
  kind text not null check(kind in ('email','phone')),
  address text not null,
  verified_at timestamptz,
  unique(person_id,kind,address)
);
create index contacts_person_idx on mhistree.contacts(person_id);
-- A shared address is deliberately NOT unique across people.
create table mhistree.patient_identifiers (
  alias text primary key,
  person_id uuid not null references mhistree.persons(id),
  origin_person_id uuid not null references mhistree.persons(id),
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  merge_operation_id uuid
);
create index patient_identifiers_person_idx on mhistree.patient_identifiers(person_id);
-- Restricted capability projection, populated by reviewed staff tooling in later tasks.
create table mhistree.staff_authorities (
  account_id uuid not null references mhistree.accounts(id),
  context_id text not null,
  organization_id uuid,
  privileges text[] not null default '{}',
  active boolean not null default true,
  evidence_reference text not null,
  primary key(account_id,context_id)
);
create table mhistree.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key(bucket,window_start)
);
create table mhistree.audit_events (
  id bigint generated always as identity primary key,
  actor_account_id uuid references mhistree.accounts(id),
  person_id uuid references mhistree.persons(id),
  action text not null,
  context_id text,
  reference_id text,
  recorded_at timestamptz not null default clock_timestamp()
);
create index audit_person_time_idx on mhistree.audit_events(person_id,recorded_at desc);

create function mhistree.prevent_history_rewrite() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_HISTORY'; end;
$$;
create trigger audit_immutable before update or delete on mhistree.audit_events for each row execute function mhistree.prevent_history_rewrite();
create function mhistree.preserve_person_origin() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.creator_account_id,new.original_context,new.original_organization_id,new.created_at) is distinct from
     (old.creator_account_id,old.original_context,old.original_organization_id,old.created_at) then raise exception 'IMMUTABLE_ORIGIN'; end if;
  return new;
end;
$$;
create trigger person_origin_immutable before update on mhistree.persons for each row execute function mhistree.preserve_person_origin();
