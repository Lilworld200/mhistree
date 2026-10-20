import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";
import { Btn } from "@/components/ui/button";
export const metadata: Metadata = { title: "Professional access" };
export default function Page() {
  return (
    <main className="account-stage">
      <section className="account-card">
        <Image
          src={logo}
          alt="Mhistree"
          height={54}
          style={{ width: "auto", height: 54, margin: "0 auto 16px" }}
          priority
        />
        <h1>Professional access</h1>
        <p className="muted">Choose how you work with Mhistree.</p>
        <div className="account-form">
          <Btn kind="dark" asChild>
            <Link href="/auth/professional/practitioner">
              Healthcare professional
            </Link>
          </Btn>
          <p>
            Register your professional profile or sign in to your clinical
            workspace.
          </p>
          <Btn asChild>
            <Link href="/auth/professional/organization">Organization</Link>
          </Btn>
          <p>
            Register a healthcare organization or sign in to manage your team.
          </p>
        </div>
        <p className="account-navigation">
          <Link className="account-link" href="/auth">
            Patient sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
