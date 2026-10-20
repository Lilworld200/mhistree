import { z } from "zod";

export const professionalEntry = z.enum(["practitioner", "organization"]);
export type ProfessionalEntry = z.infer<typeof professionalEntry>;
export const entryCookie = "mhistree-entry";
/** Navigation intent only. Never a role, permission or arbitrary redirect URL. */
export function professionalEntryPath(value: unknown) {
  const parsed = professionalEntry.safeParse(value);
  return parsed.success ? `/auth/professional/${parsed.data}` : "/chat";
}
