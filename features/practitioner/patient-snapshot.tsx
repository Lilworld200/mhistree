import { categoryLabels } from "@/features/access/sharing-types";
import type { PatientOverview } from "./patient-types";
export function PatientSnapshot({
  overview,
  summaryOnly = false,
}: {
  overview?: PatientOverview | null;
  summaryOnly?: boolean;
}) {
  if (!overview)
    return (
      <p className="patient-card-empty">
        No shared overview is available in this care context.
      </p>
    );
  return (
    <div className="patient-card-snapshot">
      <section>
        <h3>
          {overview.summaryKind === "today"
            ? "Today's reports"
            : "Record overview"}
        </h3>
        {overview.summaryKind === "overview" &&
          Boolean(overview.historyCounts?.length) && (
            <p className="patient-history-counts">
              Shared history:{" "}
              {overview
                .historyCounts!.map(
                  (item) =>
                    `${categoryLabels[item.category] ?? item.category} (${item.count})`,
                )
                .join("; ")}
              .
            </p>
          )}
        {overview.summary.length ? (
          <p>
            {overview.summary
              .slice(0, 3)
              .map((item) => item.text)
              .join(" ")}
          </p>
        ) : (
          <p>No finalized reports have been shared in this context yet.</p>
        )}
        <small>
          Based on shared records
          {overview.limited || overview.summary.length > 3
            ? " · A brief overview"
            : ""}
        </small>
      </section>
      {!summaryOnly && overview.medications.length > 0 && (
        <section>
          <h3>Reported medication use</h3>
          <ul>
            {overview.medications.map((item) => (
              <li key={item.id}>
                {item.text}
                <small>
                  Reported taking · Last recorded{" "}
                  {new Date(item.recordedAt).toLocaleDateString("en-GB", {
                    timeZone: overview.timezone,
                  })}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!summaryOnly && overview.prescriptions.length > 0 && (
        <section>
          <h3>Prescriptions</h3>
          <ul>
            {overview.prescriptions.map((item) => (
              <li key={item.id}>
                {item.text}
                <small>
                  Recorded{" "}
                  {new Date(item.recordedAt).toLocaleDateString("en-GB", {
                    timeZone: overview.timezone,
                  })}{" "}
                  · Does not confirm current use
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!summaryOnly && overview.results.length > 0 && (
        <section className="patient-card-results">
          <h3>Recent results</h3>
          {overview.results.map((item) => (
            <p key={item.id}>{item.text}</p>
          ))}
          <small>Finalized records from the last 7 days</small>
        </section>
      )}
    </div>
  );
}
