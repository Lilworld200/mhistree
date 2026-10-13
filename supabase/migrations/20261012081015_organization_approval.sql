alter table mhistree.organizations add column version integer not null default 1;
create table mhistree.organization_applications (
 organization_id uuid primary key references mhistree.organizations(id),
 applicant_account_id uuid not null references mhistree.accounts(id),
 legal_name text not null, registration_number text not null, jurisdiction text not null,
 address text not null, administrator_capacity text not null,
 request_key uuid not null unique, body_hash text not null,
 submitted_at timestamptz not null default clock_timestamp()
);
create table mhistree.organization_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references mhistree.organizations(id),
 reviewer_account_id uuid not null references mhistree.accounts(id),
 decision text not null check(decision in ('approved','rejected','suspended')),
 evidence text not null, administrator_evidence text not null,
 version integer not null, recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,version)
);
alter table mhistree.organization_applications enable row level security;
alter table mhistree.organization_reviews enable row level security;
create trigger organization_application_immutable before update or delete on mhistree.organization_applications for each row execute function mhistree.prevent_history_rewrite();
create trigger organization_review_immutable before update or delete on mhistree.organization_reviews for each row execute function mhistree.prevent_history_rewrite();
create index organization_applicant_idx on mhistree.organization_applications(applicant_account_id);
create index organization_review_actor_idx on mhistree.organization_reviews(reviewer_account_id);
