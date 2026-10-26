import { notFound } from "next/navigation";
import { PageState } from "@/components/ui/page-state";
const sections: Record<string, string> = {
  timeline: "Timeline",
  health: "Health",
  documents: "Documents",
  sharing: "Sharing",
  profile: "Profile",
  settings: "Settings",
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return { title: sections[section] ?? "Page not found" };
}
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  return (
    <PageState title={`${sections[section]} is being prepared`}>
      This section is not available at the momment. No health information is
      loaded or changed.
    </PageState>
  );
}
