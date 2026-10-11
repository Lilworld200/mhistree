create table mhistree.direct_connection_operations (
 request_key uuid primary key, actor_account_id uuid not null references mhistree.accounts(id),
 connection_id uuid not null references mhistree.connections(id), body_hash text not null
);
alter table mhistree.direct_connection_operations enable row level security;
revoke all on mhistree.direct_connection_operations from public;
create index direct_connection_operations_actor_idx on mhistree.direct_connection_operations(actor_account_id);
