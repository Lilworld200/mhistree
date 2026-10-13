create table mhistree.patient_review_requests (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references mhistree.accounts(id),
 person_id uuid not null references mhistree.persons(id),
 kind text not null check(kind in ('professional-correction','removal','account-closure')),
 event_id uuid references mhistree.contributions(id),
 reason text not null check(length(reason) between 1 and 3000),
 request_key uuid not null,
 state text not null default 'submitted' check(state in ('submitted','in-review','resolved','declined')),
 created_at timestamptz not null default clock_timestamp(),
 unique(account_id,request_key)
);
alter table mhistree.patient_review_requests enable row level security;
create policy review_owner on mhistree.patient_review_requests to mhistree_runtime using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id));
grant select,insert on mhistree.patient_review_requests to mhistree_runtime;
