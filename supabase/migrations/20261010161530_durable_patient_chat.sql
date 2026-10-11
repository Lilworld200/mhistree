create table mhistree.conversations (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references mhistree.persons(id),
 account_id uuid not null references mhistree.accounts(id),
 created_at timestamptz not null default clock_timestamp()
);
create index conversation_owner_idx on mhistree.conversations(account_id,created_at,id);
create table mhistree.chat_messages (
 id uuid primary key,
 conversation_id uuid not null references mhistree.conversations(id),
 person_id uuid not null references mhistree.persons(id),
 account_id uuid not null references mhistree.accounts(id),
 sequence bigint generated always as identity unique,
 role text not null check(role in ('patient','assistant')),
 content text not null check(length(content) between 1 and 20000),
 timezone text not null,
 captured_at timestamptz not null default clock_timestamp(),
 reply_to uuid unique references mhistree.chat_messages(id),
 request_key uuid,
 unique(account_id,request_key),
 check((role='patient' and request_key is not null and reply_to is null) or (role='assistant' and request_key is null and reply_to is not null))
);
create index message_conversation_idx on mhistree.chat_messages(conversation_id,sequence);
create table mhistree.chat_generations (
 message_id uuid primary key references mhistree.chat_messages(id),
 state text not null default 'queued' check(state in ('queued','running','succeeded','failed','cancelled')),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 error_code text,
 updated_at timestamptz not null default clock_timestamp()
);
-- Chat is patient-owned, never available to a provider through clinical consent.
create function mhistree.owns_patient_account(p_account uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from mhistree.sessions s join mhistree.accounts a on a.id=s.account_id
 where s.digest=current_setting('mhistree.session',true) and a.id=p_account and a.status='active'
 and s.retired_at is null and s.expires_at>statement_timestamp() and s.session_epoch=a.session_epoch
 and current_setting('mhistree.context',true)::jsonb->>'kind'='patient');
$$;
revoke all on function mhistree.owns_patient_account(uuid) from public;
grant execute on function mhistree.owns_patient_account(uuid) to mhistree_runtime;
alter table mhistree.conversations enable row level security;
alter table mhistree.chat_messages enable row level security;
alter table mhistree.chat_generations enable row level security;
create policy conversation_owner on mhistree.conversations to mhistree_runtime using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id));
create policy message_owner on mhistree.chat_messages to mhistree_runtime using(mhistree.owns_patient_account(account_id)) with check(mhistree.owns_patient_account(account_id) and exists(select 1 from mhistree.conversations c where c.id=conversation_id and c.account_id=chat_messages.account_id and c.person_id=chat_messages.person_id));
create policy generation_owner on mhistree.chat_generations to mhistree_runtime using(exists(select 1 from mhistree.chat_messages m where m.id=message_id)) with check(exists(select 1 from mhistree.chat_messages m where m.id=message_id));
grant select,insert on mhistree.conversations,mhistree.chat_messages to mhistree_runtime;
grant select,insert,update on mhistree.chat_generations to mhistree_runtime;
grant usage on sequence mhistree.chat_messages_sequence_seq to mhistree_runtime;
