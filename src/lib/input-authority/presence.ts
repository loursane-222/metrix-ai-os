export const INPUT_PRESENCE_DURATION_MS = 1_600;
export type InputPresencePhase = "applying" | "applied" | "error";
export type InputPresenceSnapshot = Readonly<Record<string, InputPresencePhase>>;
type Scheduler = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;

export class InputPresenceRuntime {
  private phases = new Map<string, InputPresencePhase>();
  private snapshot: InputPresenceSnapshot = Object.freeze({});
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();
  constructor(private readonly schedule: Scheduler = setTimeout, private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout) {}
  set(targetIds: readonly string[], phase: InputPresencePhase, duration = INPUT_PRESENCE_DURATION_MS): void {
    for (const targetId of targetIds) {
      const timer = this.timers.get(targetId); if (timer) this.cancel(timer);
      this.phases.set(targetId, phase);
      this.timers.set(targetId, this.schedule(() => this.clear(targetId), duration));
    }
    this.emit();
  }
  clear(targetId: string): void { const timer = this.timers.get(targetId); if (timer) this.cancel(timer); this.timers.delete(targetId); if (this.phases.delete(targetId)) this.emit(); }
  getSnapshot = (): InputPresenceSnapshot => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  resetForTests(): void { for (const timer of this.timers.values()) this.cancel(timer); this.timers.clear(); this.phases.clear(); this.emit(); }
  private emit(): void { this.snapshot = Object.freeze(Object.fromEntries(this.phases)); for (const listener of this.listeners) listener(); }
}
export const inputPresenceRuntime = new InputPresenceRuntime();
