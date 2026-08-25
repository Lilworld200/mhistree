"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { Reveal } from "@/components/ui/reveal";
import { toast } from "@/components/ui/toast-store";

interface PatientLease {
  id: string;
  patient_id: string;
  patient_name: string;
  active: boolean;
  alerts_count: number;
}

export function PatientsView() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientLease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, fetch live active patient access leases for the authenticated clinician
    setLoading(false);
  }, []);

  return (
    <div className="scroll">
      <div className="phead">
        <div>
          <h1 className="ptitle">My patients</h1>
          <p className="psub">
            No global search — access requires a patient-created lease
          </p>
        </div>
      </div>

      {loading && (
        <div
          className="card card-inset small"
          style={{ padding: 20, textAlign: "center" }}
        >
          Loading active patient leases...
        </div>
      )}

      {!loading && patients.length === 0 && (
        <Reveal>
          <div
            className="card card-inset small"
            style={{ padding: 32, textAlign: "center", color: "var(--ink2)" }}
          >
            <Icon n="lock" s={24} />
            <h3 style={{ margin: "12px 0 4px", fontSize: 16 }}>
              No active patient access leases
            </h3>
            <p className="small">
              Ask your patient to generate a QR access lease from their Mhistree
              app to view their record.
            </p>
          </div>
        </Reveal>
      )}

      {patients.map((p, i) => (
        <Reveal key={p.id} d={i * 0.05}>
          <button
            className="card evcard"
            onClick={() => {
              if (p.active) {
                router.push(`/clinician/patients/${p.patient_id}`);
              } else {
                toast(
                  "No active lease — ask the patient to share access",
                  "lock",
                );
              }
            }}
          >
            <Avatar ring="#F4A8AC" size={44} name={p.patient_name.charAt(0)} />
            <span className="evmain">
              <b>{p.patient_name}</b>
              <span className="evbadges">
                <span
                  className="badge"
                  style={{ color: p.active ? "var(--green)" : "var(--red)" }}
                >
                  <i
                    className="badge-dot"
                    style={{
                      background: p.active ? "var(--green)" : "var(--red)",
                    }}
                  />
                  {p.active ? "Lease active" : "No lease"}
                </span>
              </span>
            </span>
            <Icon n={p.active ? "chev" : "lock"} s={16} />
          </button>
        </Reveal>
      ))}
    </div>
  );
}
