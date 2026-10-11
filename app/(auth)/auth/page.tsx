import type { Metadata } from "next";
import { AccountEntry } from "@/features/patient/account/entry";
import { cookies } from "next/headers";
import { setupCookie } from "@/lib/http";
export const metadata: Metadata = { title: "Account access" };
export default async function Page() {
  return (
    <AccountEntry
      initialMode={(await cookies()).has(setupCookie) ? "setup" : "login"}
    />
  );
}
