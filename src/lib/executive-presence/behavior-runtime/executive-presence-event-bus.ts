import type { ExecutivePresenceEvent } from "./executive-presence-events";

export type ExecutivePresenceEventListener = (event: ExecutivePresenceEvent) => void;

export type ExecutivePresenceEventBus = Readonly<{
  publish: (event: ExecutivePresenceEvent) => void;
  subscribe: (listener: ExecutivePresenceEventListener) => () => void;
}>;

/**
 * Small synchronous bus with snapshot-at-publish listener semantics.
 * Unsubscribing during a publish affects subsequent publishes, not the
 * already-started delivery pass.
 */
export function createExecutivePresenceEventBus(): ExecutivePresenceEventBus {
  const listeners = new Set<ExecutivePresenceEventListener>();

  return Object.freeze({
    publish(event) {
      for (const listener of [...listeners]) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
  });
}
