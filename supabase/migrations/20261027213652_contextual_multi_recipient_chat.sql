-- Additive private workflow only. No clinical record rewrite or historical backfill.
alter table mhistree.chat_messages add column care_confirmation_id uuid;
alter table mhistree.chat_messages add column dialogue jsonb check(dialogue is null or jsonb_typeof(dialogue)='object');
alter table mhistree.chat_care_proposals drop constraint chat_care_proposals_state_check;
alter table mhistree.chat_care_proposals drop constraint chat_care_proposals_check;
alter table mhistree.chat_care_proposals add constraint chat_care_proposals_state_check check(state in ('draft','dismissed','completed','partial','failed','sending'));
alter table mhistree.chat_care_proposals add constraint chat_care_proposals_completed_result check(state<>'completed' or result_id is not null);
create table mhistree.chat_care_deliveries (
 proposal_id uuid not null references mhistree.chat_care_proposals(id),
 connection_id uuid not null references mhistree.connections(id),
 operation_key uuid not null unique default gen_random_uuid(),
 reviewed_content text not null check(length(reviewed_content) between 1 and 10000),
 state text not null default 'pending' check(state in ('pending','stored','failed')),
 result_id uuid references mhistree.care_messages(id), error_code text,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(proposal_id,connection_id),
 check((state='stored')=(result_id is not null))
);
create table mhistree.chat_care_confirmations (
 conversation_id uuid primary key references mhistree.conversations(id),
 id uuid not null unique default gen_random_uuid(),
 proposal_id uuid not null references mhistree.chat_care_proposals(id),
 proposal_version integer not null,
 anchor_message_id uuid not null references mhistree.chat_messages(id),
 question text not null,
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
 consumed_by uuid references mhistree.chat_messages(id)
);
alter table mhistree.chat_care_deliveries enable row level security;
alter table mhistree.chat_care_confirmations enable row level security;
create policy own_care_delivery on mhistree.chat_care_deliveries to mhistree_runtime
 using(exists(select 1 from mhistree.chat_care_proposals p where p.id=proposal_id and mhistree.owns_patient_account(p.account_id)))
 with check(exists(select 1 from mhistree.chat_care_proposals p where p.id=proposal_id and mhistree.owns_patient_account(p.account_id)));
create policy own_care_confirmation on mhistree.chat_care_confirmations to mhistree_runtime
 using(exists(select 1 from mhistree.conversations c join mhistree.chat_care_proposals p on p.id=chat_care_confirmations.proposal_id join mhistree.chat_messages m on m.id=p.reply_message_id where c.id=chat_care_confirmations.conversation_id and m.conversation_id=c.id and mhistree.owns_patient_account(c.account_id)))
 with check(exists(select 1 from mhistree.conversations c join mhistree.chat_care_proposals p on p.id=chat_care_confirmations.proposal_id join mhistree.chat_messages m on m.id=p.reply_message_id where c.id=chat_care_confirmations.conversation_id and m.conversation_id=c.id and mhistree.owns_patient_account(c.account_id)));
revoke all on mhistree.chat_care_deliveries,mhistree.chat_care_confirmations from public;
grant select,insert,update on mhistree.chat_care_deliveries,mhistree.chat_care_confirmations to mhistree_runtime;
grant delete on mhistree.chat_care_confirmations to mhistree_runtime;
create index chat_care_confirmation_proposal_idx on mhistree.chat_care_confirmations(proposal_id);
do $$ declare r text; begin foreach r in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=r) then
 execute format('revoke all on mhistree.chat_care_deliveries,mhistree.chat_care_confirmations from %I',r);
 end if;
end loop; end $$;
