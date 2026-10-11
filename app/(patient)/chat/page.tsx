import type { Metadata } from "next";
import { ChatView } from "@/features/ai-chat/chat-view";
export const metadata: Metadata = { title: "Conversation" };
export default function Page() {
  return <ChatView />;
}
