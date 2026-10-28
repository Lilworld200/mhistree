import { InboxView } from "@/features/messaging/inbox-view";
export const metadata = { title: "Care inbox" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string; context?: string }>;
}) {
  const query = await searchParams;
  return (
    <InboxView
      initialConnection={query.connection}
      initialContext={query.context}
    />
  );
}
