import "server-only";

/** Current views follow explicit recommendation lineage, including corrections
 * of the latest logical record. RLS applies to both workflow and source rows;
 * timeline/history queries continue to retain every event. Alias e is required. */
export const currentMedicationProjection = `not exists (
  select 1 from mhistree.medication_recommendations r
  join mhistree.contributions latest on latest.id=r.latest_event_id
  where r.id::text=e.body->'medication'->>'recommendationId'
    and latest.logical_id<>e.logical_id
)`;
