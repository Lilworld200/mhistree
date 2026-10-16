"use client";
import { createContext, useContext, useState } from "react";

type Conversation = { id: string; created_at: string };
type Navigation = {
  conversations: Conversation[];
  selected: string;
  busy: boolean;
};
const Context = createContext<{
  navigation: Navigation;
  setNavigation: React.Dispatch<React.SetStateAction<Navigation>>;
  requested: { id: string; revision: number } | null;
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
  const [requested, setRequested] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  return (
    <Context.Provider
      value={{
        navigation,
        setNavigation,
        requested,
        select: (id) =>
          setRequested((previous) => ({
            id,
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
