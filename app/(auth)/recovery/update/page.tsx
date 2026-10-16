import { EmailCallback } from "@/features/patient/account/email-callback";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { openFlow, recoveryCookie } from "@/lib/auth/flow-cookie";
export default async function UpdatePassword() {
  try {
    await openFlow((await cookies()).get(recoveryCookie)?.value, "recovery");
  } catch {
    redirect("/recovery");
  }
  return <EmailCallback recovery />;
}
