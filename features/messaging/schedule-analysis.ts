import "server-only";
import { after } from "next/server";
import { database } from "@/lib/db/client";
import { aiGateway } from "@/lib/ai/gateway";
import { withAccess, type ActingContext } from "@/features/access/server";
import { processInboxAnalysis } from "./analysis";

/** Queued work survives process interruption; failures require explicit Retry. */
export function scheduleInboxAnalysis(
  session: string,
  context: ActingContext,
  connectionId?: string,
) {
  after(async () => {
    try {
      const pool = database();
      const jobs = await withAccess(
        pool,
        session,
        context,
        async (a) =>
          (
            await a.tx.query(
              "select connection_id,id from mhistree.care_analysis_jobs where (state='queued' or (state='running' and lease_until<clock_timestamp())) and ($1::uuid is null or connection_id=$1) order by created_at,id limit 2",
              [connectionId ?? null],
            )
          ).rows,
      );
      for (const job of jobs)
        await processInboxAnalysis(
          pool,
          session,
          context,
          job.connection_id,
          aiGateway(),
          job.id,
        );
    } catch {
      /* Retain queued work; fresh authorized inbox access can resume. */
    }
  });
}
