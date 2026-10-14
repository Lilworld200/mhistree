import Link from "next/link";
import { EmailRecoveryForm } from "./email-recovery-form";

export function RecoveryOptions() {
  return (
    <main className="account-stage">
      <section className="account-card">
        <h1>Forgot your password?</h1>
        <p className="muted">Choose how to recover your account.</p>
        <div className="recovery-options">
          <EmailRecoveryForm />
          <Link className="recovery-option" href="/auth?method=code">
            <strong>Use a recovery code</strong>
            <span>Enter your private code to choose a new password.</span>
          </Link>
          <details className="recovery-option">
            <summary>Get help verifying your identity</summary>
            <p>
              Contact your care organization’s authorized identity support team.
              After verifying your identity, they can issue a private recovery
              code. If ownership is uncertain, they must escalate to Mhistree
              support.
            </p>
            <p>
              Your care team never chooses your password. For this MVP,
              activating a login requires an email address. Recovery ends your
              previous sign-in sessions.
            </p>
            <Link className="account-link" href="/auth?method=code">
              I have a recovery code
            </Link>
          </details>
        </div>
        <p className="muted">SMS recovery is not available yet.</p>
        <p className="account-navigation">
          <Link className="account-link" href="/auth">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
