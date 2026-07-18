"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import {
  ExecutivePresenceContext,
  type ExecutivePresencePresentationMode,
  type ExecutivePresenceRuntime,
} from "./ExecutivePresenceContext";
import { ExecutivePresenceHost } from "./ExecutivePresenceHost";
import {
  createExecutivePresenceBehaviorAdapter,
  type ExecutivePresenceBehaviorAdapter,
} from "./ExecutivePresenceBehaviorAdapter";
import { scheduleExecutivePresenceClockTick } from "./ExecutivePresenceClockTickHost";
import type {
  ExecutivePresenceEvent,
  ExecutivePresenceSnapshot,
} from "@/lib/executive-presence/behavior-runtime";

const IDLE_SERVER_SNAPSHOT: ExecutivePresenceSnapshot = Object.freeze({
  status: "idle",
  activeSignals: Object.freeze([]),
  activeOperationId: null,
  correlationId: null,
  scopeId: null,
  source: null,
  reason: null,
  error: null,
  errorCategory: null,
  startedAt: null,
  updatedAt: null,
  terminalOutcome: null,
  terminalFeedback: null,
});

export function ExecutivePresenceRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const behaviorAdapterRef = useRef<ExecutivePresenceBehaviorAdapter | null>(null);
  if (behaviorAdapterRef.current === null) {
    behaviorAdapterRef.current = createExecutivePresenceBehaviorAdapter();
  }
  const behaviorAdapter = behaviorAdapterRef.current;
  const behaviorSnapshot = useSyncExternalStore(
    behaviorAdapter.subscribe,
    behaviorAdapter.getSnapshot,
    () => IDLE_SERVER_SNAPSHOT,
  );
  const clockTickSequence = useRef(0);
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
  const publishPresenceEvent = useCallback(
    (event: ExecutivePresenceEvent) => behaviorAdapter.publish(event),
    [behaviorAdapter],
  );

  useEffect(() => () => behaviorAdapter.destroy(), [behaviorAdapter]);

  useEffect(() => {
    const visibleUntil = behaviorSnapshot.terminalFeedback?.visibleUntil;
    if (visibleUntil === undefined) return;

    return scheduleExecutivePresenceClockTick({
      visibleUntil,
      publish: publishPresenceEvent,
      eventId: () => {
        clockTickSequence.current += 1;
        return `executive-presence-clock:${Date.now()}:${clockTickSequence.current}`;
      },
    });
  }, [behaviorSnapshot.terminalFeedback, publishPresenceEvent]);

  const runtime = useMemo<ExecutivePresenceRuntime>(
    () => ({
      behaviorSnapshot,
      publishPresenceEvent,
      isPanelOpen,
      hasChatContentMounted,
      presentationMode,
      openPanel,
      closePanel,
      mountChatContent,
    }),
    [
      behaviorSnapshot,
      closePanel,
      hasChatContentMounted,
      isPanelOpen,
      mountChatContent,
      openPanel,
      presentationMode,
      publishPresenceEvent,
    ],
  );

  return (
    <ExecutivePresenceContext.Provider value={runtime}>
      {children}
      <ExecutivePresenceHost />
    </ExecutivePresenceContext.Provider>
  );
}
