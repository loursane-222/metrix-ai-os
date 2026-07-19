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
import { usePathname, useRouter } from "next/navigation";
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
import type { ExecutiveActivitySnapshot } from "@/lib/executive-activity";
import type { ExecutiveLifecycleEnvelope } from "@/lib/executive-lifecycle";

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
const EMPTY_ACTIVITY_SNAPSHOT: ExecutiveActivitySnapshot = Object.freeze({
  sessionId: null, items: Object.freeze([]), outcome: null, updatedAt: null,
});

export function ExecutivePresenceRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
  const activitySnapshot = useSyncExternalStore(
    behaviorAdapter.subscribeActivity,
    behaviorAdapter.getActivitySnapshot,
    () => EMPTY_ACTIVITY_SNAPSHOT,
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
  const openFullConversation = useCallback(() => router.push("/metrix"), [router]);
  const publishPresenceEvent = useCallback(
    (event: ExecutivePresenceEvent) => behaviorAdapter.publish(event),
    [behaviorAdapter],
  );
  const publishLifecycleEnvelope = useCallback(
    (envelope: ExecutiveLifecycleEnvelope) => behaviorAdapter.publishLifecycle(envelope),
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
      activitySnapshot,
      publishPresenceEvent,
      publishLifecycleEnvelope,
      isPanelOpen,
      hasChatContentMounted,
      presentationMode,
      openPanel,
      closePanel,
      mountChatContent,
      openFullConversation,
    }),
    [
      behaviorSnapshot,
      activitySnapshot,
      closePanel,
      hasChatContentMounted,
      isPanelOpen,
      mountChatContent,
      openPanel,
      openFullConversation,
      presentationMode,
      publishPresenceEvent,
      publishLifecycleEnvelope,
    ],
  );

  return (
    <ExecutivePresenceContext.Provider value={runtime}>
      {children}
      <ExecutivePresenceHost />
    </ExecutivePresenceContext.Provider>
  );
}
