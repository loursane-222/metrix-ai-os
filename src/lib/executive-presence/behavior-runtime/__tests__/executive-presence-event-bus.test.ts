import { describe, expect, it } from "vitest";

import { createExecutivePresenceEventBus } from "../executive-presence-event-bus";
import type { ExecutivePresenceEvent } from "../executive-presence-events";

function tick(eventId: string, timestamp: number): ExecutivePresenceEvent {
  return { eventId, type: "CLOCK_TICK", source: "clock", timestamp };
}

describe("Executive Presence Event Bus", () => {
  it("delivers events synchronously in publish and subscription order", () => {
    const bus = createExecutivePresenceEventBus();
    const received: string[] = [];
    bus.subscribe((event) => received.push(`first:${event.eventId}`));
    bus.subscribe((event) => received.push(`second:${event.eventId}`));

    bus.publish(tick("one", 1));
    bus.publish(tick("two", 2));

    expect(received).toEqual(["first:one", "second:one", "first:two", "second:two"]);
  });

  it("supports idempotent unsubscribe between publishes", () => {
    const bus = createExecutivePresenceEventBus();
    const received: string[] = [];
    const unsubscribe = bus.subscribe((event) => received.push(event.eventId));

    bus.publish(tick("one", 1));
    unsubscribe();
    unsubscribe();
    bus.publish(tick("two", 2));

    expect(received).toEqual(["one"]);
  });

  it("uses a stable listener snapshot when a listener unsubscribes during publish", () => {
    const bus = createExecutivePresenceEventBus();
    const received: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    bus.subscribe((event) => {
      received.push(`first:${event.eventId}`);
      unsubscribeSecond();
    });
    unsubscribeSecond = bus.subscribe((event) => received.push(`second:${event.eventId}`));

    bus.publish(tick("one", 1));
    bus.publish(tick("two", 2));

    expect(received).toEqual(["first:one", "second:one", "first:two"]);
  });
});
