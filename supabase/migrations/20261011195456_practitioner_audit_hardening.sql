-- Keep explicit draft-team permissions inside the draft's original organization/context.
create or replace function mhistree.can_work(p_patient uuid,p_author uuid,p_context text,p_org uuid,p_category text,p_team uuid[],p_write boolean) returns boolean language sql security definer set search_path='' as $$
select mhistree.can_access(p_patient,p_patient,p_category,'private',p_author,p_context,case when p_write then 'write' else 'read' end,p_org)
or (p_org is not null
 and current_setting('mhistree.context',true)::jsonb->>'kind'='organization'
 and current_setting('mhistree.context',true)::jsonb->>'organizationId'=p_org::text
 and 'organization:'||(current_setting('mhistree.context',true)::jsonb->>'connectionId')=p_context
 and exists(select 1 from mhistree.sessions s join mhistree.accounts a on a.id=s.account_id where s.digest=current_setting('mhistree.session',true) and a.id=any(p_team) and mhistree.can_access(p_patient,p_patient,p_category,'finalized',a.id,p_context,case when p_write then 'write' else 'read' end,p_org)));
$$;
create or replace function mhistree.notify_care_event() returns trigger language plpgsql security definer set search_path='' as $$declare c record;notification_event_key text;notification_kind text;target uuid;begin
if tg_table_name='care_messages' then select co.* into c from mhistree.care_threads t join mhistree.connections co on co.id=t.connection_id where t.id=new.thread_id;notification_event_key:='message:'||new.id;notification_kind:='message';
elsif tg_table_name='appointments' then select * into c from mhistree.connections where id=new.connection_id;notification_event_key:='appointment:'||new.id||':'||new.version;notification_kind:='appointment';
else select * into c from mhistree.connections where id=new.connection_id;notification_event_key:='request:'||new.id||':'||new.version;notification_kind:='request';end if;
for target in select id from mhistree.accounts where person_id=c.patient_person_id and status='active' union select c.practitioner_account_id where c.practitioner_account_id is not null loop
insert into mhistree.notifications(account_id,event_key,kind,connection_id,reference_id) values(target,notification_event_key,notification_kind,c.id,new.id) on conflict(account_id,event_key) do nothing;end loop;return new;end;$$;

