-- Private reviewed care proposals are not clinical sources or shared care messages.
create table mhistree.chat_care_proposals (
 id uuid primary key default gen_random_uuid(),
 reply_message_id uuid not null unique references mhistree.chat_messages(id),
 account_id uuid not null references mhistree.accounts(id),
 kind text not null check(kind in ('message','appointment')),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 state text not null default 'draft' check(state in ('draft','dismissed','completed')),
 version integer not null default 1 check(version>0),
 operation_key uuid not null unique default gen_random_uuid(),
 result_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((state='completed')=(result_id is not null))
);
alter table mhistree.chat_care_proposals enable row level security;
create policy own_chat_care_proposal on mhistree.chat_care_proposals to mhistree_runtime
 using(mhistree.owns_patient_account(account_id) and exists(select 1 from mhistree.chat_messages m where m.id=reply_message_id and m.account_id=chat_care_proposals.account_id and m.role='assistant'))
 with check(mhistree.owns_patient_account(account_id) and exists(select 1 from mhistree.chat_messages m where m.id=reply_message_id and m.account_id=chat_care_proposals.account_id and m.role='assistant'));
revoke all on mhistree.chat_care_proposals from public;
grant select,insert on mhistree.chat_care_proposals to mhistree_runtime;
grant update(payload,state,version,result_id,updated_at) on mhistree.chat_care_proposals to mhistree_runtime;
do $$ declare api_role text; begin
 foreach api_role in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=api_role) then
   execute format('revoke all on mhistree.chat_care_proposals from %I',api_role);
  end if;
 end loop;
end $$;
