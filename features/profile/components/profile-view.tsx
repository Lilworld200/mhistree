"use client";

import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { FactRow } from "@/components/ui/fact-row";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/reveal";
import { ProfileHero } from "./profile-hero";

const TABS = [
  "Overview",
  "Medical",
  "Allergies",
  "Medications",
  "Conditions",
  "Emergency",
];

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="grid2" style={{ marginTop: 16 }}>
        {children}
      </div>
    </motion.div>
  );
}

interface UserProfileData {
  user: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    date_of_birth?: string;
  } | null;
  profile: {
    blood_group?: string;
    genotype?: string;
    allergies?: string;
    chronic_conditions?: string;
    lifestyle?: string;
  } | null;
  memories: Array<{
    id: string;
    fact_category: string;
    fact_summary: string;
    contributor_role: string;
    created_at: string;
  }>;
  medications: Array<{
    id: string;
    drug_name: string;
    dosage: string;
    frequency: string;
    trust_score?: number | null;
    inferred_by?: string | null;
  }>;
}

export function ProfileView() {
  const router = useRouter();
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/profile?user_id=default");
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          const errMsg = json.error || `HTTP ${res.status} ${res.statusText}`;
          console.error("[Profile Fetch Error]:", errMsg);
          setError(errMsg);
          setData(null);
        } else {
          const json = await res.json();
          setData(json);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load profile";
        console.error("[Profile Fetch Exception]:", err);
        setError(msg);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const fullName = data?.user
    ? `${data.user.first_name || ""} ${data.user.last_name || ""}`.trim()
    : "User Profile";

  const allergies =
    data?.memories.filter((m) => m.fact_category === "allergy") ?? [];
  const conditions =
    data?.memories.filter((m) => m.fact_category === "chronic_condition") ?? [];

  return (
    <div className="scroll">
      <Reveal>
        <ProfileHero
          name={fullName}
          bloodGroup={data?.profile?.blood_group || undefined}
          genotype={data?.profile?.genotype || undefined}
          eventsCount={data?.memories.length || 0}
          error={error}
        />
      </Reveal>

      <Tabs.Root defaultValue="Overview">
        <Tabs.List
          className="pills"
          aria-label="Profile sections"
          style={{ marginTop: 22 }}
        >
          {TABS.map((t) => (
            <Tabs.Trigger key={t} value={t} className="pill">
              {t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="Overview">
          <Panel>
            <div className="card">
              <Label>Medical baseline</Label>
              {loading ? (
                <p className="small">Loading profile from Supabase...</p>
              ) : (
                <>
                  <FactRow
                    k="Blood group"
                    v={data?.profile?.blood_group || "Not recorded"}
                    src="self"
                  />
                  <FactRow
                    k="Genotype"
                    v={data?.profile?.genotype || "Not recorded"}
                    src="self"
                  />
                  <FactRow
                    k="Allergies"
                    v={
                      data?.profile?.allergies ||
                      (allergies.length > 0
                        ? allergies[0].fact_summary
                        : "None listed")
                    }
                    src="clinician"
                  />
                  <FactRow
                    k="Medications"
                    v={
                      data?.medications.length
                        ? `${data.medications[0].drug_name} ${data.medications[0].dosage}`
                        : "None listed"
                    }
                    src="clinician"
                  />
                </>
              )}
            </div>
            <div className="card">
              <Label
                right={
                  <button
                    className="link"
                    onClick={() => router.push("/timeline")}
                  >
                    Timeline
                  </button>
                }
              >
                Personal summary
              </Label>
              <p className="small">
                {data?.profile?.lifestyle ||
                  "No personal lifestyle summary recorded in Supabase."}
              </p>
              <Label>Recent health facts</Label>
              {data?.memories && data.memories.length > 0 ? (
                data.memories
                  .slice(0, 3)
                  .map((m) => (
                    <FactRow
                      key={m.id}
                      k={new Date(m.created_at).toLocaleDateString()}
                      v={m.fact_summary}
                      src={
                        m.contributor_role === "clinician"
                          ? "clinician"
                          : "self"
                      }
                    />
                  ))
              ) : (
                <p
                  className="small"
                  style={{ color: "var(--ink2)", marginTop: 6 }}
                >
                  No recent health facts found.
                </p>
              )}
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Medical">
          <Panel>
            <div className="card">
              <Label>Medical baseline</Label>
              <FactRow
                k="Blood group"
                v={data?.profile?.blood_group || "Not recorded"}
                src="self"
              />
              <FactRow
                k="Genotype"
                v={data?.profile?.genotype || "Not recorded"}
                src="self"
              />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Allergies">
          <Panel>
            <div className="card">
              <Label>Allergies</Label>
              {allergies.length > 0 ? (
                allergies.map((a) => (
                  <FactRow
                    key={a.id}
                    k={a.fact_summary}
                    v="Recorded fact"
                    src="clinician"
                  />
                ))
              ) : (
                <p className="small" style={{ color: "var(--ink2)" }}>
                  No allergy facts found in Supabase.
                </p>
              )}
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Medications">
          <Panel>
            <div className="card">
              <Label>Current medications</Label>
              {data?.medications && data.medications.length > 0 ? (
                data.medications.map((m) => (
                  <div key={m.id} style={{ marginBottom: 8 }}>
                    <FactRow
                      k={`${m.drug_name} ${m.dosage}`}
                      v={m.frequency}
                      src="clinician"
                    />
                    {(m.trust_score != null || m.inferred_by) && (
                      <p
                        className="small"
                        style={{
                          color: "var(--ink2)",
                          marginTop: 2,
                          marginLeft: 4,
                          fontSize: "0.75rem",
                        }}
                      >
                        {m.trust_score != null
                          ? `Trust: ${m.trust_score.toFixed(0)}%`
                          : ""}
                        {m.trust_score != null && m.inferred_by ? " · " : ""}
                        {m.inferred_by
                          ? `Inferred by: ${
                              m.inferred_by === "doctor"
                                ? "Doctor"
                                : m.inferred_by === "self_reported"
                                  ? "Self (OTC)"
                                  : m.inferred_by === "pharmacist"
                                    ? "Pharmacist"
                                    : "AI"
                            }`
                          : ""}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="small" style={{ color: "var(--ink2)" }}>
                  No active medications recorded.
                </p>
              )}
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Conditions">
          <Panel>
            <div className="card">
              <Label>Conditions</Label>
              {conditions.length > 0 ? (
                conditions.map((c) => (
                  <FactRow
                    key={c.id}
                    k={c.fact_summary}
                    v="Recorded memory"
                    src="ai"
                  />
                ))
              ) : (
                <p className="small" style={{ color: "var(--ink2)" }}>
                  No chronic conditions recorded.
                </p>
              )}
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Emergency">
          <Panel>
            <div className="card">
              <Label>Emergency contact</Label>
              <FactRow
                k="Phone"
                v={data?.user?.phone_number || "Not provided"}
                src="self"
              />
              <FactRow
                k="Blood group"
                v={data?.profile?.blood_group || "Not recorded"}
                src="self"
              />
            </div>
          </Panel>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
