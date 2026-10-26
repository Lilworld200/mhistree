-- Additive patient-owned microphone provenance; no change to access grants or clinical acceptance.
alter table mhistree.chat_messages
 add column input_method text not null default 'text'
   check (input_method in ('text','microphone')),
 add column transcription jsonb,
 add constraint chat_microphone_provenance check (
   (input_method='text' and transcription is null)
   or (input_method='microphone' and role='patient' and transcription is not null
     and jsonb_typeof(transcription)='object'
     and transcription ?& array['id','text','model','capturedAt','audioSha256','durationSeconds']
     and length(transcription->>'text') between 1 and 10000)
 );
-- A provider transcript can be accepted only once, even with a new request key/conversation.
create unique index chat_transcription_once on mhistree.chat_messages ((transcription->>'id'))
 where input_method='microphone';
