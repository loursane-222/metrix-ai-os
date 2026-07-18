import {
  createExecutivePresenceEngine,
  createExecutivePresenceEventBus,
  type ExecutivePresenceEngine,
  type ExecutivePresenceEvent,
  type ExecutivePresenceEventBus,
  type ExecutivePresenceSnapshot,
} from "@/lib/executive-presence/behavior-runtime";

type BehaviorAdapterDependencies = Readonly<{
  createBus?: () => ExecutivePresenceEventBus;
  createEngine?: () => ExecutivePresenceEngine;
}>;

export type ExecutivePresenceBehaviorAdapter = Readonly<{
  getSnapshot: () => ExecutivePresenceSnapshot;
  subscribe: ExecutivePresenceEngine["subscribe"];
  publish: (event: ExecutivePresenceEvent) => void;
  destroy: () => void;
}>;

export function createExecutivePresenceBehaviorAdapter(
  dependencies: BehaviorAdapterDependencies = {},
): ExecutivePresenceBehaviorAdapter {
  const bus = (dependencies.createBus ?? createExecutivePresenceEventBus)();
  const engine = (dependencies.createEngine ?? createExecutivePresenceEngine)();
  const detachEngine = engine.attachEventBus(bus);
  let destroyed = false;

  return Object.freeze({
    getSnapshot: engine.getSnapshot,
    subscribe: engine.subscribe,
    publish(event) {
      bus.publish(event);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      detachEngine();
      engine.destroy();
    },
  });
}
