import Link from "next/link";
export default function Recovery() {
  return (
    <main className="account-stage">
      <section className="account-card">
        <h1>Recover account access</h1>
        <p>
          Ask your care organization’s authorized identity support team to
          verify your identity and issue a private recovery code. If ownership
          is uncertain, they must escalate to Mhistree support.
        </p>
        <p>
          You can recover without an email address or phone. Staff will not ask
          to choose your password. Recovery retires your previous sessions.
        </p>
        <Link href="/auth">Enter your private recovery code</Link>
      </section>
    </main>
  );
}
