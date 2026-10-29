-- Cover inbox lineage lookups and foreign-key checks without changing stored records.
create index care_analysis_jobs_connection_id_lookup on mhistree.care_analysis_jobs(connection_id);
create index care_analysis_jobs_patient_person_id_lookup on mhistree.care_analysis_jobs(patient_person_id);
create index care_pending_findings_job_id_lookup on mhistree.care_pending_findings(job_id);
create index care_pending_findings_message_id_lookup on mhistree.care_pending_findings(message_id);
create index care_pending_findings_patient_person_id_lookup on mhistree.care_pending_findings(patient_person_id);
create index care_pending_findings_connection_id_lookup on mhistree.care_pending_findings(connection_id);
create index care_pending_findings_review_run_id_lookup on mhistree.care_pending_findings(review_run_id);
create index medication_recommendations_reviewed_event_id_lookup on mhistree.medication_recommendations(reviewed_event_id);

-- Acting context is transaction-local: read it once per statement, retaining all row-dependent authorization.
alter policy own_care_analysis on mhistree.care_analysis_jobs to mhistree_runtime
 using(mhistree.is_session_actor(account_id) and acting_context=(select current_setting('mhistree.context',true))::jsonb and mhistree.can_participate(connection_id,'messages.send'))
 with check(mhistree.is_session_actor(account_id) and acting_context=(select current_setting('mhistree.context',true))::jsonb and mhistree.can_participate(connection_id,'messages.send') and exists(select 1 from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where m.id=message_id and m.author_account_id=account_id and t.connection_id=care_analysis_jobs.connection_id and t.patient_person_id=care_analysis_jobs.patient_person_id));
alter policy own_care_findings on mhistree.care_pending_findings to mhistree_runtime
 using(mhistree.is_session_actor(account_id) and acting_context=(select current_setting('mhistree.context',true))::jsonb and mhistree.can_participate(connection_id,'messages.send') and mhistree.can_access(patient_person_id,patient_person_id,category,'private',account_id,(acting_context->>'kind')||':'||connection_id::text,'write',nullif(acting_context->>'organizationId','')::uuid))
 with check(mhistree.is_session_actor(account_id) and acting_context=(select current_setting('mhistree.context',true))::jsonb and mhistree.can_participate(connection_id,'messages.send') and mhistree.can_access(patient_person_id,patient_person_id,category,'private',account_id,(acting_context->>'kind')||':'||connection_id::text,'write',nullif(acting_context->>'organizationId','')::uuid) and exists(select 1 from mhistree.care_analysis_jobs j where j.id=job_id and j.message_id=care_pending_findings.message_id and j.account_id=care_pending_findings.account_id and j.patient_person_id=care_pending_findings.patient_person_id and j.connection_id=care_pending_findings.connection_id));
