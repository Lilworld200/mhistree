"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { FactRow, MiniRow } from "@/components/ui/fact-row";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/reveal";
import { CARE_TEAM } from "@/lib/demo/people";
import { ProfileHero } from "./profile-hero";

const TABS = [
  "Overview",
  "Medical",
  "Allergies",
  "Medications",
  "Conditions",
  "Emergency",
  "Care Team",
];

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="grid2" style={{ marginTop: 16 }}>{children}</div>
    </motion.div>
  );
}

export function ProfileView() {
  const router = useRouter();

  return (
    <div className="scroll">
      <Reveal>
        <ProfileHero />
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
              <FactRow k="Blood group" v="O+" src="self" />
              <FactRow k="Genotype" v="AS" src="self" />
              <FactRow k="Allergy" v="Penicillin" src="clinician" />
              <FactRow k="Condition" v="Asthma — provisional" src="ai" />
              <FactRow k="Medication" v="Salbutamol inhaler" src="clinician" />
            </div>
            <div className="card">
              <Label
                right={
                  <button className="link" onClick={() => router.push("/timeline")}>
                    Timeline
                  </button>
                }
              >
                Personal summary
              </Label>
              <p className="small">
                Student, active with school practicals and football. Prefers concise
                replies and being called Nati. Values privacy: personal diary stays
                personal.
              </p>
              <Label>Recent health changes</Label>
              <FactRow k="19 Aug" v="Breathing difficulty" src="self" />
              <FactRow k="20 Aug" v="Inhaler started" src="clinician" />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Medical">
          <Panel>
            <div className="card">
              <Label>Medical baseline</Label>
              <FactRow k="Blood group" v="O+" src="self" />
              <FactRow k="Genotype" v="AS" src="self" />
              <FactRow k="Allergy" v="Penicillin" src="clinician" />
              <FactRow k="Condition" v="Asthma — provisional" src="ai" />
              <FactRow k="Medication" v="Salbutamol inhaler" src="clinician" />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Allergies">
          <Panel>
            <div className="card">
              <Label>Allergies</Label>
              <FactRow k="Penicillin" v="Reaction: rash (2024)" src="clinician" />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Medications">
          <Panel>
            <div className="card">
              <Label>Current medications</Label>
              <FactRow k="Salbutamol 100mcg" v="2 puffs PRN before exertion" src="clinician" />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Conditions">
          <Panel>
            <div className="card">
              <Label>Conditions</Label>
              <FactRow k="Exercise-induced asthma" v="Provisional — spirometry 28 Aug" src="ai" />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Emergency">
          <Panel>
            <div className="card">
              <Label>Emergency</Label>
              <FactRow k="Contact" v="Mrs. Adeyemi · +234 801 000 0000" src="self" />
              <FactRow k="Blood group" v="O+" src="self" />
              <FactRow k="Allergy alert" v="Penicillin" src="clinician" />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="Care Team">
          <Panel>
            <div className="card">
              <Label>Care team</Label>
              {CARE_TEAM.map((c) => (
                <MiniRow key={c.name}>
                  <Avatar img={c.img} ring={c.ring} size={38} name={c.name} />
                  <span>
                    <b>{c.name}</b>
                    <span className="small block">{c.role}</span>
                  </span>
                </MiniRow>
              ))}
            </div>
          </Panel>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
