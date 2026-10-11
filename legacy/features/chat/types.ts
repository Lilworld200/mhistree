export type MessageRole = "user" | "ai" | "sys";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  /** Timeline event id attached to system chips. */
  evId?: string;
  /** AI used durable health memory for this reply. */
  mem?: boolean;
  /** Animate the typewriter for this message. */
  fresh?: boolean;
}

export type SessionGroup =
  | "Today"
  | "Yesterday"
  | "Previous 7 days"
  | "Previous month";

export interface ChatSession {
  id: string;
  title: string;
  group: SessionGroup;
}

export interface ReplyRule {
  re: RegExp;
  type: import("@/features/timeline/model").EventType;
  title: string;
  reply: (prior?: import("@/features/timeline/model").TimelineEvent) => string;
}
