import Image from "next/image";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";
import type { ProfessionalEntry } from "@/features/auth/entry-path";
import { Icon } from "@/components/ui/icons";
export const professionalStages = [
  "Your account",
  "Verify email",
  "Professional details",
  "Credentials",
  "Review & submit",
];
export const organizationStages = [
  "Administrator account",
  "Verify email",
  "Organization details",
  "Location & authority",
  "Review & submit",
];
export function OnboardingFrame({
  entry,
  stage,
  children,
}: {
  entry: ProfessionalEntry;
  stage: number;
  children?: React.ReactNode;
}) {
  const professional = entry === "practitioner";
  const steps = professional ? professionalStages : organizationStages;
  return (
    <main className="account-stage pro-entry">
      <section
        className="account-card pro-panel"
        aria-label={
          professional
            ? "Healthcare practitioner registration"
            : "Organization registration"
        }
      >
        <header className="account-auth-header">
          <div className="account-auth-heading">
            <h1>
              {professional
                ? "Practitioner registration"
                : "Organization registration"}
            </h1>
            <p className="muted">
              Your care, part of a continuing health story.
            </p>
          </div>
          <Image
            src={logo}
            alt="Mhistree"
            height={54}
            className="account-auth-logo"
            priority
          />
        </header>
        <ol className="pro-steps" aria-label="Registration progress">
          {steps.map((label, i) => (
            <li
              key={label}
              aria-label={label}
              aria-current={i === stage ? "step" : undefined}
              className={i < stage ? "complete" : i === stage ? "current" : ""}
            >
              <span aria-hidden="true">{i < stage ? "✓" : i + 1}</span>
              <span className="pro-step-label">{label}</span>
            </li>
          ))}
        </ol>
        <div className="pro-panel-content">{children}</div>
        <footer className="pro-panel-footer">
          <Icon n="shield" s={16} />
          <p>
            {professional
              ? "Your credentials are reviewed before clinical access is enabled."
              : "Organization approval, staff permissions and clinical qualifications are reviewed separately."}
          </p>
        </footer>
      </section>
    </main>
  );
}
