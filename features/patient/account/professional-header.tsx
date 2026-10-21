"use client";
import Image from "next/image";
import Link from "next/link";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";
import {
  professionalAuthPath,
  type ProfessionalEntry,
} from "@/features/auth/entry-path";
export function ProfessionalHeader({
  entry,
  mode,
  disabled = false,
}: {
  entry: ProfessionalEntry;
  mode: "login" | "signup";
  disabled?: boolean;
}) {
  return (
    <header className="professional-access-header">
      <nav
        className="professional-access-tabs"
        aria-label="Professional account type"
      >
        {(["practitioner", "organization"] as const).map((type) => (
          <Link
            key={type}
            href={professionalAuthPath(type, mode)}
            className="professional-access-tab"
            aria-current={entry === type ? "page" : undefined}
            aria-disabled={disabled}
            onClick={event => { if (disabled) event.preventDefault(); }}
          >
            {type === "practitioner"
              ? "Healthcare professional"
              : "Organization"}
          </Link>
        ))}
      </nav>
      <Image
        src={logo}
        alt="Mhistree"
        height={54}
        className="account-auth-logo"
        priority
      />
    </header>
  );
}
