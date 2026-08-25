"use client";

import { Avatar } from "@/components/ui/avatar";

interface ProfileHeroProps {
  name?: string;
  preferredName?: string;
  age?: string | number;
  bloodGroup?: string;
  genotype?: string;
  eventsCount?: number;
  documentsCount?: number;
  error?: string | null;
}

export function ProfileHero({
  name = "User Profile",
  preferredName,
  age,
  bloodGroup,
  genotype,
  eventsCount = 0,
  documentsCount = 0,
  error,
}: ProfileHeroProps) {
  const initial = name ? name.charAt(0).toUpperCase() : "U";
  const bioString = [
    age ? `${age} yrs` : null,
    bloodGroup ? `Blood Group: ${bloodGroup}` : null,
    genotype ? `Genotype: ${genotype}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="hero">
        <div className="hrow">
          <span className="hid">
            <Avatar ring="#F4A8AC" size={34} name={initial} />
            <b>{name}</b>
          </span>
          {preferredName && (
            <span className="hpill">Preferred name · {preferredName}</span>
          )}
        </div>
        <div className="hcenter">
          <span className="hpill">Health identity</span>
          <div
            className="display"
            style={{ fontSize: "clamp(22px,3.5vw,34px)", marginTop: 4 }}
          >
            {bioString || "Live Health Identity Record"}
          </div>
          <span className="hsub">
            {eventsCount} events recorded · {documentsCount} documents
          </span>
        </div>
      </div>

      {error && (
        <div
          className="card card-inset"
          style={{
            padding: 14,
            marginTop: 12,
            borderColor: "#E57373",
            color: "#D32F2F",
          }}
        >
          <b>Profile API Error:</b> {error}. Terminal error logged to console.
        </div>
      )}
    </>
  );
}
