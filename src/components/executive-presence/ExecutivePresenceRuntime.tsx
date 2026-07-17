"use client";

import {
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  ExecutivePresenceContext,
  type ExecutivePresencePresentationMode,
  type ExecutivePresenceRuntime,
} from "./ExecutivePresenceContext";
import { ExecutivePresenceHost } from "./ExecutivePresenceHost";

export function ExecutivePresenceRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [hasChatContentMounted, setHasChatContentMounted] = useState(false);
  const presentationMode: ExecutivePresencePresentationMode =
    pathname === "/metrix" ? "full-screen" : "floating";
  const openPanel = useCallback(() => {
    setHasChatContentMounted(true);
    setIsPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const mountChatContent = useCallback(() => setHasChatContentMounted(true), []);

  const runtime = useMemo<ExecutivePresenceRuntime>(
    () => ({
      isPanelOpen,
      hasChatContentMounted,
      presentationMode,
      openPanel,
      closePanel,
      mountChatContent,
    }),
    [closePanel, hasChatContentMounted, isPanelOpen, mountChatContent, openPanel, presentationMode],
  );

  return (
    <ExecutivePresenceContext.Provider value={runtime}>
      {children}
      <ExecutivePresenceHost />
    </ExecutivePresenceContext.Provider>
  );
}
