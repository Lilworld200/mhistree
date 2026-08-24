"use client";

import { Avatar, AvatarRail } from "@/components/ui/avatar";
import { AVATARS, CARE_TEAM, PATIENT } from "@/lib/demo/people";

export function ProfileHero() {
  return (
    <>
      <div className="hero">
        <div className="hrow">
          <span className="hid">
            <Avatar img={AVATARS.nati} ring="#F4A8AC" size={34} name="N" />
            <b>{PATIENT.name}</b>
          </span>
          <span className="hpill">Preferred name · {PATIENT.preferredName}</span>
        </div>
        <div className="hcenter">
          <span className="hpill">Health identity</span>
          <div
            className="display"
            style={{ fontSize: "clamp(26px,4vw,38px)" }}
          >
            24 yrs · O+ · AS
          </div>
          <span className="hsub">
            8 events · 4 verified · 2 documents · 1 active lease
          </span>
        </div>
      </div>

      <AvatarRail>
        {CARE_TEAM.slice(0, 4).map((c) => (
          <span key={c.name} title={c.name}>
            <Avatar img={c.img} ring={c.ring} size={50} name={c.name} />
          </span>
        ))}
      </AvatarRail>
    </>
  );
}
