"use client";
import { createContext, useContext, useState } from "react";

import type { Conversation } from "@/features/ai-chat/conversation";
type Selection = {
  id: string;
  revision: number;
  previousConversationId?: string;
  newConversation?: boolean;
};
type Navigation = {
  conversations: Conversation[];
  selected: string;
  busy: boolean;
};
const Context = createContext<{
  navigation: Navigation;
  setNavigation: React.Dispatch<React.SetStateAction<Navigation>>;
  requested: Selection | null;
  select: (id: string) => void;
} | null>(null);
export function ChatNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [navigation, setNavigation] = useState<Navigation>({
    conversations: [],
    selected: "",
    busy: false,
  });
  const [requested, setRequested] = useState<Selection | null>(null);
  return (
    <Context.Provider
      value={{
        navigation,
        setNavigation,
        requested,
        select: (id) =>
          setRequested((previous) => ({
            id: id || crypto.randomUUID(),
            previousConversationId: navigation.selected || undefined,
            ...(!id
              ? {
                  newConversation: true,
                  previousConversationId: navigation.selected || undefined,
                }
              : {}),
            revision: (previous?.revision ?? 0) + 1,
          })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useChatNavigation() {
  return useContext(Context);
}
