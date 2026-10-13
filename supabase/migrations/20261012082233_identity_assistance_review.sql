create table mhistree.identity_support_cases (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references mhistree.persons(id),
 organization_id uuid not null references mhistree.organizations(id), reporter_account_id uuid not null references mhistree.accounts(id),
 evidence text not null,state text not null default 'pending' check(state in ('pending','resolved','rejected')),
 version integer not null default 1,created_at timestamptz not null default clock_timestamp()
);
create table mhistree.identity_support_decisions (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references mhistree.identity_support_cases(id),
 reviewer_account_id uuid not null references mhistree.accounts(id),decision text not null,evidence text not null,recorded_at timestamptz not null default clock_timestamp()
);
create table mhistree.recovery_designations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references mhistree.organizations(id),account_id uuid not null references mhistree.accounts(id),reviewer_account_id uuid not null references mhistree.accounts(id),evidence text not null,active boolean not null,recorded_at timestamptz not null default clock_timestamp()
);
alter table mhistree.identity_support_cases enable row level security;
alter table mhistree.identity_support_decisions enable row level security;
alter table mhistree.recovery_designations enable row level security;
create trigger support_decision_immutable before update or delete on mhistree.identity_support_decisions for each row execute function mhistree.prevent_history_rewrite();
create trigger recovery_designation_immutable before update or delete on mhistree.recovery_designations for each row execute function mhistree.prevent_history_rewrite();
