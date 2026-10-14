import type { Metadata } from "next";
import { AccountEntry } from "@/features/patient/account/entry";
import { cookies } from "next/headers";
import { setupCookie } from "@/lib/http";
export const metadata: Metadata = { title: "Account access" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ method?: string | string[] }>;
}) {
  const method = (await searchParams).method;
  const initialMode = (await cookies()).has(setupCookie)
    ? "setup"
    : method === "code"
      ? "redeem"
      : "login";
  return <AccountEntry key={initialMode} initialMode={initialMode} />;
}
