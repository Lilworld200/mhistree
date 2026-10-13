alter table mhistree.professionals add column version integer not null default 1;
create table mhistree.professional_applications (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references mhistree.accounts(id),
 legal_name text not null, profession text not null, registration_number text not null, jurisdiction text not null,
 credential_key uuid not null, credential_hash text not null, credential_name text not null,
 submitted_at timestamptz not null default clock_timestamp(), request_key uuid not null unique
);
create table mhistree.professional_reviews (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references mhistree.professional_applications(id),
 reviewer_account_id uuid not null references mhistree.accounts(id), decision text not null check(decision in ('approved','rejected','suspended')),
 authority_url text not null, evidence text not null, privileges text[] not null,
 reviewed_at timestamptz not null default clock_timestamp()
);
create index professional_applications_owner_idx on mhistree.professional_applications(account_id,submitted_at desc);
create index professional_reviews_application_idx on mhistree.professional_reviews(application_id,reviewed_at desc);
alter table mhistree.professional_applications enable row level security;
alter table mhistree.professional_reviews enable row level security;
revoke all on mhistree.professional_applications,mhistree.professional_reviews from public;
create trigger application_immutable before update or delete on mhistree.professional_applications for each row execute function mhistree.prevent_history_rewrite();
create trigger review_immutable before update or delete on mhistree.professional_reviews for each row execute function mhistree.prevent_history_rewrite();
