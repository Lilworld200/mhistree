alter table mhistree.memberships add column version integer not null default 1;
alter table mhistree.assignments add column version integer not null default 1;
create table mhistree.organization_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references mhistree.organizations(id),
 account_id uuid not null references mhistree.accounts(id), invited_by uuid not null references mhistree.accounts(id),
 privileges text[] not null, state text not null default 'pending' check(state in ('pending','accepted','declined','replaced')),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days', created_at timestamptz not null default clock_timestamp()
);
create unique index organization_pending_invite_idx on mhistree.organization_invitations(organization_id,account_id) where state='pending';
alter table mhistree.organization_invitations enable row level security;
create table mhistree.organization_connection_operations (
 request_key uuid primary key, actor_account_id uuid not null references mhistree.accounts(id),
 connection_id uuid not null references mhistree.connections(id), body_hash text not null
);
alter table mhistree.organization_connection_operations enable row level security;
