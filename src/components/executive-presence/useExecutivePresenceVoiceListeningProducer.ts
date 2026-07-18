"use client";

import { useEffect, useRef } from "react";

import { useExecutivePresence } from "./ExecutivePresenceContext";
import type { ExecutivePresenceEvent } from "@/lib/executive-presence/behavior-runtime";

type VoicePresenceKind =
  | "idle"
  | "connecting"
  | "listening"
  | "userSpeaking"
  | "thinking"
  | "speaking";

type VoiceListeningProducerDependencies = Readonly<{
  publish: (event: ExecutivePresenceEvent) => void;
  createId?: () => string;
  now?: () => number;
}>;

export type VoiceListeningProducer = Readonly<{
  onPresenceTransition: (presenceKind: VoicePresenceKind) => void;
  release: () => void;
}>;

export function createVoiceListeningProducer({
  publish,
  createId = () => crypto.randomUUID(),
  now = Date.now,
}: VoiceListeningProducerDependencies): VoiceListeningProducer {
  let correlationId: string | null = null;

  function endListening(): void {
    if (correlationId === null) return;
    const completedCorrelationId = correlationId;
    correlationId = null;
    publish({
      type: "VOICE_LISTENING_ENDED",
      eventId: createId(),
      source: "voice-experience-orchestrator",
      timestamp: now(),
      correlationId: completedCorrelationId,
    });
  }

  return Object.freeze({
    onPresenceTransition(presenceKind) {
      if (presenceKind !== "listening") {
        endListening();
        return;
      }
      if (correlationId !== null) return;

      correlationId = createId();
      publish({
        type: "VOICE_LISTENING_STARTED",
        eventId: createId(),
        source: "voice-experience-orchestrator",
        timestamp: now(),
        correlationId,
      });
    },
    release: endListening,
  });
}

export function useExecutivePresenceVoiceListeningProducer(
  presenceKind: VoicePresenceKind,
): void {
  const { publishPresenceEvent } = useExecutivePresence();
  const producerRef = useRef<VoiceListeningProducer | null>(null);
  if (producerRef.current === null) {
    producerRef.current = createVoiceListeningProducer({ publish: publishPresenceEvent });
  }
  const producer = producerRef.current;

  useEffect(() => {
    producer.onPresenceTransition(presenceKind);
  }, [presenceKind, producer]);

  useEffect(() => () => producer.release(), [producer]);
}
