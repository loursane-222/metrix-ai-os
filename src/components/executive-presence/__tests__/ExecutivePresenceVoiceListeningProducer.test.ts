import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { ExecutivePresenceEvent } from "@/lib/executive-presence/behavior-runtime";
import { createVoiceListeningProducer } from "../useExecutivePresenceVoiceListeningProducer";

type VoiceListeningEvent = Extract<
  ExecutivePresenceEvent,
  { type: "VOICE_LISTENING_STARTED" | "VOICE_LISTENING_ENDED" }
>;

function collectVoiceListeningEvent(
  events: VoiceListeningEvent[],
): (event: ExecutivePresenceEvent) => void {
  return (event) => {
    if (
      event.type === "VOICE_LISTENING_STARTED" ||
      event.type === "VOICE_LISTENING_ENDED"
    ) {
      events.push(event);
    }
  };
}

describe("Executive Presence voice listening producer", () => {
  it("publishes one correlated start/end pair for a listening transition", () => {
    const events: VoiceListeningEvent[] = [];
    let sequence = 0;
    const producer = createVoiceListeningProducer({
      publish: collectVoiceListeningEvent(events),
      createId: () => `id-${++sequence}`,
      now: () => 1_000 + sequence,
    });

    producer.onPresenceTransition("idle");
    producer.onPresenceTransition("listening");
    producer.onPresenceTransition("listening");
    producer.onPresenceTransition("userSpeaking");
    producer.onPresenceTransition("thinking");

    expect(events.map((event) => event.type)).toEqual([
      "VOICE_LISTENING_STARTED",
      "VOICE_LISTENING_ENDED",
    ]);
    expect(events[0].correlationId).toBe("id-1");
    expect(events[1].correlationId).toBe("id-1");
    expect(events[0].eventId).not.toBe(events[1].eventId);
  });

  it("starts a new correlation only when listening is entered again", () => {
    const events: VoiceListeningEvent[] = [];
    let sequence = 0;
    const producer = createVoiceListeningProducer({
      publish: collectVoiceListeningEvent(events),
      createId: () => `id-${++sequence}`,
      now: () => 2_000,
    });

    producer.onPresenceTransition("listening");
    producer.onPresenceTransition("thinking");
    producer.onPresenceTransition("listening");
    producer.release();
    producer.release();

    expect(events.map((event) => event.type)).toEqual([
      "VOICE_LISTENING_STARTED",
      "VOICE_LISTENING_ENDED",
      "VOICE_LISTENING_STARTED",
      "VOICE_LISTENING_ENDED",
    ]);
    expect(events[0].correlationId).toBe(events[1].correlationId);
    expect(events[2].correlationId).toBe(events[3].correlationId);
    expect(events[0].correlationId).not.toBe(events[2].correlationId);
  });

  it("uses only the Executive Presence context publish boundary", () => {
    const adapterSource = readFileSync(
      fileURLToPath(
        new URL("../useExecutivePresenceVoiceListeningProducer.ts", import.meta.url),
      ),
      "utf8",
    );
    const orchestratorSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../metrix-tab/voice/useVoiceExperienceOrchestrator.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(adapterSource).toContain("const { publishPresenceEvent } = useExecutivePresence()");
    expect(adapterSource).not.toMatch(/ExecutivePresence(?:EventBus|Engine|BehaviorAdapter)/);
    expect(orchestratorSource).toContain(
      "useExecutivePresenceVoiceListeningProducer(presence.kind)",
    );
    expect(orchestratorSource.match(/useExecutivePresenceVoiceListeningProducer\(/g)).toHaveLength(
      1,
    );
  });

  it("publishes synchronously without polling or status setters", () => {
    const publish = vi.fn();
    const producer = createVoiceListeningProducer({
      publish,
      createId: () => "stable-id",
      now: () => 3_000,
    });

    producer.onPresenceTransition("listening");
    expect(publish).toHaveBeenCalledTimes(1);
    producer.onPresenceTransition("idle");
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
