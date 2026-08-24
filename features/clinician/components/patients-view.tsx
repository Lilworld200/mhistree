"use client";

import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { Reveal } from "@/components/ui/reveal";
import { toast } from "@/components/ui/toast-store";
import { AVATARS } from "@/lib/demo/people";

export function PatientsView() {
  const router = useRouter();
  return (
    <div className="scroll">
      <div className="phead">
        <div>
          <h1 className="ptitle">My patients</h1>
          <p className="psub">No global search — access requires a patient-created lease</p>
        </div>
      </div>

      <Reveal>
        <button className="card evcard" onClick={() => router.push("/clinician/patients/p1")}>
          <Avatar img={AVATARS.nati} ring="#F4A8AC" size={44} name="N" />
          <span className="evmain">
            <b>Nati Adeyemi</b>
            <span className="evwhen">24 · O+ · AS · last interaction today 7:05 PM</span>
            <span className="evbadges">
              <span className="badge" style={{ color: "var(--green)" }}>
                <i className="badge-dot" style={{ background: "var(--green)" }} />
                Lease active
              </span>
              <span className="badge" style={{ color: "var(--amber)" }}>
                <i className="badge-dot" style={{ background: "var(--amber)" }} />
                2 alerts
              </span>
            </span>
          </span>
          <Icon n="chev" s={16} />
        </button>
      </Reveal>

      <Reveal d={0.06}>
        <button
          className="card evcard"
          onClick={() => toast("No active lease — ask the patient to share access", "lock")}
        >
          <Avatar ring="#B7E4C7" size={44} name="Musa Ibrahim" />
          <span className="evmain">
            <b>Musa Ibrahim</b>
            <span className="evwhen">41 · last visit 12 Aug</span>
            <span className="evbadges">
              <span className="badge" style={{ color: "var(--red)" }}>
                <i className="badge-dot" style={{ background: "var(--red)" }} />
                No lease
              </span>
            </span>
          </span>
          <Icon n="lock" s={16} />
        </button>
      </Reveal>
    </div>
  );
}
