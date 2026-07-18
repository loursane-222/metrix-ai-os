import type { ExecutivePresenceEvent } from "@/lib/executive-presence/behavior-runtime";

type ClockTickHostOptions = Readonly<{
  visibleUntil: number;
  eventId: () => string;
  publish: (event: ExecutivePresenceEvent) => void;
  now?: () => number;
}>;

export function scheduleExecutivePresenceClockTick({
  visibleUntil,
  eventId,
  publish,
  now = Date.now,
}: ClockTickHostOptions): () => void {
  const timeoutId = setTimeout(() => {
    publish({
      type: "CLOCK_TICK",
      eventId: eventId(),
      source: "executive-presence-react-adapter",
      timestamp: now(),
    });
  }, Math.max(0, visibleUntil - now()));

  return () => clearTimeout(timeoutId);
}
