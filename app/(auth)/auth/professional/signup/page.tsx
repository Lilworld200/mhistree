import {
  ProfessionalAccess,
  type ProfessionalSearch,
} from "@/features/patient/account/professional-access";
export const metadata = { title: "Practitioner and organization registration" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ProfessionalSearch>;
}) {
  return <ProfessionalAccess query={await searchParams} />;
}
