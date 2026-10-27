export type Conversation = {
  id: string;
  created_at: string;
  title?: string;
  titleReady?: boolean;
};
/** Useful immediately, bounded, and free of obvious identifiers. */
export function conversationPreview(text: string) {
  return (
    text
      .replace(
        /https?:\/\/\S+|\b\S+@\S+\.\S+\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b\d{5,}\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64) || "New conversation"
  );
}
