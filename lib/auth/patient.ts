import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database, transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { sessionCookie } from "@/lib/http";
import { DomainError } from "@/lib/errors";
export async function currentPatient() {
  const session = (await cookies()).get(sessionCookie)?.value ?? "";
  if (!session) return null;
  try {
    const actor = await transaction(
      (tx) => verifySession(tx, session),
      database(),
    );
    return { session, actor };
  } catch (error) {
    if (
      error instanceof DomainError &&
      ["AUTH_REQUIRED", "SESSION_RETIRED"].includes(error.code)
    )
      return null;
    throw error;
  }
}
export async function requirePatient(loginPath = "/auth") {
  const patient = await currentPatient();
  if (!patient) redirect(loginPath);
  return patient;
}
