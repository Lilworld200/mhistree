import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
const origin='http://127.0.0.1:3101';
const config=JSON.parse(await readFile('.local/app-database.json','utf8'));
assert.equal(config.host,'127.0.0.1','Synthetic fixture bootstrap is local only');
const pool=new Pool(config);
function client(){const cookies=new Map<string,string>();return {async raw(path:string,body?:unknown){const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const value of r.headers.getSetCookie()){const pair=value.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}return r;},async api(path:string,body?:unknown){const response=await this.raw(path,body);const result=await response.json();assert.equal(result.ok,true,`${path}: HTTP ${response.status} ${result.error?.code??'bad envelope'}`);return result.data;}};}
async function account(label:string){const c=client(),password=randomBytes(24).toString('base64url');await c.api('/api/auth/signup',{displayName:`Synthetic direct journey ${label} ${randomUUID()}`,requestKey:randomBytes(32).toString('base64url')});const setup=await c.api('/api/auth/setup',{password});await c.api('/api/auth/login',{identifier:setup.loginIdentifier,password});const identity=(await pool.query('select id,person_id from mhistree.accounts where login_identifier=$1',[setup.loginIdentifier])).rows[0];return {...c,...identity};}
try{
const patient=await account('patient'),doctor=await account('doctor'),recipient=await account('recipient'),reviewer=await account('reviewer');
// The only privilege fixture: a designated synthetic reviewer, never a real credential approval.
await pool.query("insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,'review:professionals','{professional.review}','local synthetic acceptance reviewer')",[reviewer.id]);
assert.equal((await patient.raw('/api/review')).status,403);
for(const actor of [doctor,recipient]){const application=await actor.api('/api/practitioner',{legalName:'Synthetic acceptance applicant',profession:'Test physician',registrationNumber:'SYNTHETIC-ONLY',jurisdiction:'Test registry',filename:'synthetic-credential.pdf',base64:Buffer.from('%PDF-1.4\nSynthetic verification fixture, not a real credential\n%%EOF').toString('base64'),requestKey:randomUUID()});assert.equal((await actor.raw('/api/practitioner/patients')).status,403);await reviewer.api('/api/review',{applicationId:application.id,version:1,decision:'approved',authorityUrl:'https://example.org/synthetic-registry',evidence:'Synthetic automated acceptance review, not real medical qualification.',privileges:['records.read','records.write','appointments.manage','messages.send','requests.read','requests.create','results.finalize','person.register','person.lookup','auth.activate']});}
console.log('PASS same-account credentials, restricted reviewer, pending denial and approval');
const scope={categories:['clinical','result','allergy'],exclusions:[]};
const connection=(await doctor.api('/api/practitioner/patients',{action:'connect',data:{patientPersonId:patient.person_id,requestKey:randomUUID(),method:'login',...scope}})).id;
assert.equal((await doctor.raw(`/api/practitioner/workspace?connection=${connection}`)).status,403);
await patient.api('/api/connections',{action:'consent',data:{connectionId:connection,version:1,mode:'approve',...scope}});
const receiving=(await recipient.api('/api/practitioner/patients',{action:'connect',data:{patientPersonId:patient.person_id,requestKey:randomUUID(),method:'in-person',evidence:'Synthetic in-person identity and explicit scope confirmation.',...scope}})).id;
async function act(actor:typeof doctor,id:string,action:string,data:unknown){return actor.api('/api/practitioner/workspace',{connectionId:id,action,data});}
const startsAt=new Date(Date.now()+3*86400000).toISOString(),endsAt=new Date(Date.now()+3*86400000+1800000).toISOString();
const booking=await patient.api('/api/care',{action:'book',data:{connectionId:connection,practitionerId:doctor.id,requestKey:randomUUID(),slot:{startsAt,endsAt,timezone:'Africa/Lagos'}}});
await act(doctor,connection,'appointment',{id:booking.id,version:1,action:'accept'});
const text={connectionId:connection,requestKey:randomUUID(),content:'Synthetic durable care message'};
const msg=await patient.api('/api/care',{action:'message',data:text});assert.equal((await patient.api('/api/care',{action:'message',data:text})).id,msg.id);
await act(doctor,connection,'message',{connectionId:connection,requestKey:randomUUID(),content:'Synthetic provider response'});
let today=await doctor.api('/api/practitioner/today');assert.ok(today.items.some((i:{unread:number})=>i.unread>0));await act(doctor,connection,'read',{});today=await doctor.api('/api/practitioner/today');assert.equal(today.items[0].unread,0);
console.log('PASS patient consent, durable appointment, two-way text and unread state');
async function work(actor:typeof doctor,id:string,kind:string,category:string,text:string){return act(actor,id,'save',{requestKey:randomUUID(),patientPersonId:patient.person_id,kind,category,body:{text,bodySite:null,contextLinks:[]},occurredAt:{precision:'unknown'},timezone:'Africa/Lagos'});}
await work(doctor,connection,'private-note','clinical','PRIVATE_SYNTHETIC_ONLY');const entry=await work(doctor,connection,'draft','allergy','Synthetic unconfirmed allergy report');await act(doctor,connection,'finalize',{id:entry.id,version:1,requestKey:randomUUID(),reviewed:true,status:'unknown'});
const records=await patient.api('/api/records');assert.ok(records.items.some((e:{source_status:string})=>e.source_status==='professional-finalized'));assert.ok(!JSON.stringify(records).includes('PRIVATE_SYNTHETIC_ONLY'));
let request=await act(doctor,connection,'request',{patientPersonId:patient.person_id,recipientConnectionId:receiving,recipientAccountId:recipient.id,serviceName:'Synthetic narrow service',priority:'routine',requestedFor:null,authorizationBasis:'Active independent recipient consent to results',requestKey:randomUUID()});
for(const action of ['accepted','in-progress','performed'])request=await act(recipient,receiving,'request-transition',{id:request.id,version:request.version,action});
const resultWork=await work(recipient,receiving,'draft','result','Synthetic finalized result');request=await act(recipient,receiving,'request-transition',{id:request.id,version:request.version,action:'result-draft',workId:resultWork.id});await act(recipient,receiving,'result',{requestId:request.id,version:request.version,entry:{id:resultWork.id,version:1,requestKey:randomUUID(),reviewed:true,status:'unknown'}});
const care=await patient.api('/api/care');assert.ok(care.requests.some((r:{state:string;result_body:unknown})=>r.state==='finalized'&&r.result_body));
console.log('PASS private notes isolated; reviewed entry and qualified result visible to patient');
await patient.api('/api/connections',{action:'revoke',data:{id:connection}});assert.equal((await doctor.raw(`/api/practitioner/workspace?connection=${connection}`)).status,403);
console.log('PASS revoked direct workspace denied; complete synthetic HTTP direct-care journey');
}finally{await pool.end();}
