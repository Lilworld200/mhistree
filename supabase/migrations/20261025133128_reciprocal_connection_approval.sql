-- Existing reviewed grants remain valid. New direct producers explicitly supply
-- both approval flags. Existing pending direct requests originated with practitioners
-- and still require patient confirmation; reviewed active grants remain unchanged.
alter table mhistree.connections add column patient_approved boolean not null default true;
alter table mhistree.connections add column practitioner_approved boolean not null default true;
update mhistree.connections set patient_approved=false where kind='direct' and status='pending';
alter table mhistree.connections add constraint direct_connection_approval check(kind<>'direct' or status<>'active' or (patient_approved and practitioner_approved));
create table mhistree.connection_approval_settings (
 account_id uuid primary key references mhistree.accounts(id),
 patient_auto_approve boolean not null default false,
 practitioner_auto_approve boolean not null default false,
 patient_categories text[] not null default '{}',
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default clock_timestamp()
);
create table mhistree.connection_approval_setting_versions (
 account_id uuid not null references mhistree.accounts(id), version integer not null,
 patient_auto_approve boolean not null, practitioner_auto_approve boolean not null,
 patient_categories text[] not null, recorded_at timestamptz not null default clock_timestamp(),
 primary key(account_id,version)
);
alter table mhistree.connection_approval_settings enable row level security;
alter table mhistree.connection_approval_setting_versions enable row level security;
-- Private server-owned settings; no Data API/runtime grants. Session ownership is
-- checked by the owning service, with immutable versions retained as grant evidence.
