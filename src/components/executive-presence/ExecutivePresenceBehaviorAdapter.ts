import {
  createExecutivePresenceEngine,
  createExecutivePresenceEventBus,
  type ExecutivePresenceEngine,
  type ExecutivePresenceEvent,
  type ExecutivePresenceEventBus,
  type ExecutivePresenceSnapshot,
} from "@/lib/executive-presence/behavior-runtime";
import {
  createExecutiveActivityProjection,
  type ExecutiveActivitySnapshot,
} from "@/lib/executive-activity";

type BehaviorAdapterDependencies = Readonly<{
  createBus?: () => ExecutivePresenceEventBus;
  createEngine?: () => ExecutivePresenceEngine;
}>;

export type ExecutivePresenceBehaviorAdapter = Readonly<{
  getSnapshot: () => ExecutivePresenceSnapshot;
  subscribe: ExecutivePresenceEngine["subscribe"];
  getActivitySnapshot: () => ExecutiveActivitySnapshot;
  subscribeActivity: (listener: () => void) => () => void;
  publish: (event: ExecutivePresenceEvent) => void;
  destroy: () => void;
}>;

export function createExecutivePresenceBehaviorAdapter(
  dependencies: BehaviorAdapterDependencies = {},
): ExecutivePresenceBehaviorAdapter {
  const bus = (dependencies.createBus ?? createExecutivePresenceEventBus)();
  const engine = (dependencies.createEngine ?? createExecutivePresenceEngine)();
  const activity = createExecutiveActivityProjection();
  const detachEngine = engine.attachEventBus(bus);
  const detachActivity = bus.subscribe(activity.project);
  let destroyed = false;

  return Object.freeze({
    getSnapshot: engine.getSnapshot,
    subscribe: engine.subscribe,
    getActivitySnapshot: activity.getSnapshot,
    subscribeActivity: activity.subscribe,
    publish(event) {
      bus.publish(event);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      detachEngine();
      detachActivity();
      activity.destroy();
      engine.destroy();
    },
  });
}
