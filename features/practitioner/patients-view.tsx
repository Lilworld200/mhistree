"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { api, errorMessage } from "@/lib/client-api";
import { categoryLabels } from "@/features/access/sharing-types";
import { PatientSnapshot } from "./patient-snapshot";
import { PatientEntryPanel } from "./patient-entry-panel";
import type {
  DirectPatient,
  AssignedPatient,
  PatientCapabilities,
} from "./patient-types";

function PatientAvatar({ name }: { name: string }) {
  return (
    <span className="sharing-avatar" aria-hidden="true">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
function Scope({
  categories,
  exclusions = [],
}: {
  categories?: string[];
  exclusions?: string[];
}) {
  const scope = categories?.filter((c) => !exclusions.includes(c)) ?? [];
  return scope.length > 0 ? (
    <p className="sharing-help">
      Sharing scope: {scope.map((c) => categoryLabels[c] ?? c).join(", ")}
    </p>
  ) : null;
}

export function PatientsView({
  initial,
  assigned = [],
  capabilities = { lookup: false, register: false, connect: false },
}: {
  initial: DirectPatient[];
  assigned?: AssignedPatient[];
  capabilities?: PatientCapabilities;
}) {
  const [rows, setRows] = useState(initial),
    [tab, setTab] = useState<"direct" | "organization" | "pending" | "ended">(
      "direct",
    ),
    [query, setQuery] = useState(""),
    [entry, setEntry] = useState(false),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const counts = {
    direct: rows.filter((row) => row.status === "active").length,
    organization: assigned.length,
    pending: rows.filter((row) => row.status === "pending").length,
    ended: rows.filter((row) => row.status === "revoked").length,
  };
  const matches = (name: string) =>
    name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const direct = rows.filter(
    (row) =>
      row.status ===
        (tab === "pending"
          ? "pending"
          : tab === "ended"
            ? "revoked"
            : "active") && matches(row.display_name),
  );
  const organization = assigned.filter((row) =>
    matches(`${row.display_name} ${row.organization_name}`),
  );
  const hasRows =
    !error &&
    (tab === "organization" ? organization.length > 0 : direct.length > 0);
  const [responding, setResponding] = useState<string | null>(null);
  async function respond(row: DirectPatient, action: "approve" | "decline") {
    setResponding(row.id);
    setError("");
    try {
      await api("/api/practitioner/patients", {
        action: "respond",
        data: { id: row.id, version: row.revision, action },
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResponding(null);
    }
  }
  async function refresh() {
    try {
      const next = await api<DirectPatient[]>("/api/practitioner/patients");
      setRows(next);
      setError("");
      router.refresh();
    } catch (e) {
      setRows([]);
      setError(errorMessage(e));
      throw e;
    }
  }
  useEffect(() => {
    let active = true;
    const reload = () => {
      void api<DirectPatient[]>("/api/practitioner/patients")
        .then((next) => {
          if (active) {
            setRows(next);
            setError("");
            router.refresh();
          }
        })
        .catch((e) => {
          if (active) {
            setRows([]);
            setError(errorMessage(e));
          }
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", reload);
    const timer = setInterval(onVisible, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", reload);
    };
  }, [router]);
  function addPatient(event: React.MouseEvent<HTMLElement>) {
    trigger.current = event.currentTarget;
    setEntry(true);
  }
  const canAdd = capabilities.lookup || capabilities.register;
  return (
    <section className="patient-page sharing-page practitioner-patients">
      {canAdd && (
        <MobileTopbarActions>
          <Btn sm icon="plus" onClick={addPatient}>
            Add patient
          </Btn>
        </MobileTopbarActions>
      )}
      <header className="phead sharing-desktop-header">
        <div>
          <h1 className="ptitle">My patients</h1>
          <p className="psub">
            Your direct connections and organization-assigned care.
          </p>
        </div>
        {canAdd && (
          <Btn icon="plus" kind="dark" onClick={addPatient}>
            Add patient
          </Btn>
        )}
      </header>
      <div className="practitioner-list-tools">
        <label className="searchpill">
          <Icon n="search" />
          <span className="sr-only">Search your patients</span>
          <input
            type="search"
            placeholder="Search your patients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Btn
          icon="clock"
          sm
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await refresh();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh connections"}
        </Btn>
      </div>
      <nav className="sharing-tabs" aria-label="Patient views">
        {(
          [
            ["direct", "Direct patients"],
            ["organization", "Organization patients"],
            ["pending", "Pending requests"],
            ["ended", "Ended connections"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`pill ${tab === value ? "on" : ""}`}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
            <span className="sharing-count">{counts[value]}</span>
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {tab === "pending" && (
        <p className="sharing-help">
          Review incoming requests below. Requests you sent wait for the patient
          to approve. Record access stays closed until both sides have approved.
        </p>
      )}
      {tab === "ended" && (
        <p className="sharing-help">
          Access through these connections has ended. A new request requires
          fresh patient consent; paused care does not restart automatically.
        </p>
      )}
      {tab === "organization" && (
        <p className="sharing-help">
          Each patient opens in their assigned organization context. Assignments
          remain within that organization’s consent scope.
        </p>
      )}
      {!hasRows ? (
        <div className="card sharing-empty">
          <Icon
            n={query ? "search" : tab === "pending" ? "clock" : "steth"}
            s={28}
          />
          <h2>
            {query
              ? "No matching patients"
              : tab === "organization"
                ? "No organization assignments"
                : tab === "pending"
                  ? "No pending requests"
                  : tab === "ended"
                    ? "No ended connections"
                    : "Your patient connections start here"}
          </h2>
          <p>
            {query
              ? "Try another name or clear your search."
              : tab === "organization"
                ? "Patients assigned to you by an organization will appear here."
                : tab === "pending"
                  ? "Connection requests awaiting approval will appear here."
                  : tab === "ended"
                    ? "Past connections remain here for reference."
                    : "Patients appear here after a connection is approved or in-person consent is recorded."}
          </p>
        </div>
      ) : (
        <div className="sharing-connection-grid">
          {tab === "organization"
            ? organization.map((row) => (
                <article
                  className="card patient-overview-card"
                  key={`${row.assignment_id}:${row.connection_id ?? row.basis_id}`}
                >
                  <div className="sharing-person">
                    <PatientAvatar name={row.display_name} />
                    <div>
                      <h2>
                        <Link
                          href={`/organizations/record?organization=${row.organization_id}&${row.basis_id ? `basis=${row.basis_id}` : `connection=${row.connection_id}`}&assignment=${row.assignment_id}`}
                          aria-label={`View ${row.display_name}\'s patient details`}
                        >
                          {row.display_name}
                        </Link>
                      </h2>
                      <p>
                        {row.organization_name} ·{" "}
                        {row.basis_id
                          ? "Initial care"
                          : "Organization connection"}
                      </p>
                    </div>
                    <Icon n="chevronRight" />
                  </div>
                  <PatientSnapshot overview={row.overview} />
                </article>
              ))
            : direct.map((row) =>
                row.status === "active" ? (
                  <article className="card patient-overview-card" key={row.id}>
                    <div className="sharing-person">
                      <PatientAvatar name={row.display_name} />
                      <div>
                        <h2>
                          <Link
                            href={`/clinician/patients/${row.id}`}
                            aria-label={`View ${row.display_name}\'s patient details`}
                          >
                            {row.display_name}
                          </Link>
                        </h2>
                        <p>Direct connection</p>
                      </div>
                      <Icon n="chevronRight" />
                    </div>
                    <PatientSnapshot overview={row.overview} />
                  </article>
                ) : (
                  <article className="card sharing-connection" key={row.id}>
                    <div className="sharing-person">
                      <PatientAvatar name={row.display_name} />
                      <div>
                        <h2>{row.display_name}</h2>
                        <p>Direct connection</p>
                      </div>
                      <span className={`badge sharing-status ${row.status}`}>
                        {row.status === "pending"
                          ? "Awaiting approval"
                          : "Access ended"}
                      </span>
                    </div>
                    <Scope
                      categories={row.categories}
                      exclusions={row.exclusions}
                    />
                    <p className="sharing-help">
                      {row.status === "pending"
                        ? row.practitioner_approved === false
                          ? "This patient has requested a connection. Review the scope before approving."
                          : "Waiting for the patient to confirm sharing."
                        : "Fresh consent is needed before opening this record."}
                    </p>
                    {row.status === "pending" &&
                      row.practitioner_approved === false && (
                        <div className="sharing-card-actions">
                          <Btn
                            kind="dark"
                            sm
                            disabled={responding !== null}
                            onClick={() => void respond(row, "approve")}
                          >
                            {responding === row.id
                              ? "Updating…"
                              : "Approve connection"}
                          </Btn>
                          <Btn
                            sm
                            disabled={responding !== null}
                            onClick={() => void respond(row, "decline")}
                          >
                            Decline request
                          </Btn>
                        </div>
                      )}
                  </article>
                ),
              )}
        </div>
      )}
      <p className="sharing-help">
        Lists show up to 100 direct connections and 100 organization
        assignments. Search filters the loaded list.
      </p>
      {entry && (
        <PatientEntryPanel
          capabilities={capabilities}
          rows={rows}
          onClose={() => setEntry(false)}
          onConnected={refresh}
          returnFocus={() => trigger.current}
        />
      )}
    </section>
  );
}
