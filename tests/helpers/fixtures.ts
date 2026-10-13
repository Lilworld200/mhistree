import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { digest, secret } from "@/features/auth/sessions";

/** Synthetic trusted setup only; never exported from application features. */
export async function staffFixture(
  pool: Pool,
  privileges: string[] = [
    "person.register",
    "person.lookup",
    "auth.activate",
    "auth.recover",
  ],
) {
  const personId = randomUUID(),
    accountId = randomUUID(),
    session = secret(),
    contextId = `direct:${accountId}`;
  await pool.query(
    `insert into mhistree.persons(id,display_name,original_context) values($1,'Synthetic reviewer','fixture')`,
    [personId],
  );
  await pool.query(
    `insert into mhistree.accounts(id,person_id,provider,provider_subject,login_identifier,status) values($1,$2,'fixture',$1::uuid::text,$1::uuid::text,'active')`,
    [accountId, personId],
  );
  await pool.query(
    `insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,$2,$3,'synthetic-evidence')`,
    [accountId, contextId, privileges],
  );
  await pool.query(
    `insert into mhistree.professionals(account_id,status,privileges) values($1,'approved','{records.read,records.write}')`,
    [accountId],
  );
  await pool.query(
    `insert into mhistree.sessions(digest,account_id,session_epoch,provider_session_id,provider_token_digest,expires_at) values($1,$2,0,'synthetic','synthetic',clock_timestamp()+interval '1 hour')`,
    [digest(session), accountId],
  );
  return { personId, accountId, session, contextId };
}
