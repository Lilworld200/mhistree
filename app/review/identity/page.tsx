import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { identitySupportQueue } from "@/features/identity/assistance";
import { IdentitySupportView } from "@/features/identity/assistance-view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <IdentitySupportView
      initial={JSON.parse(
        JSON.stringify(await identitySupportQueue(database(), session)),
      )}
    />
  );
}
