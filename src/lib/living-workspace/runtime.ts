import { validateWorkspaceDirective, type WorkspaceDirective } from "./contracts";

export class LivingWorkspaceRuntime {
  private current: WorkspaceDirective | null = null;
  private history: WorkspaceDirective[] = [];
  private listeners = new Set<() => void>();
  publish(input: unknown) {
    const next = validateWorkspaceDirective(input);
    if (!next || Date.parse(next.expiresAt) <= Date.now()) return false;
    if (this.current && Date.parse(next.generatedAt) < Date.parse(this.current.generatedAt)) return false;
    if (this.current) this.history.push(this.current);
    this.current = next; this.emit(); return true;
  }
  back() { const previous = this.history.pop(); if (!previous) return false; this.current = previous; this.emit(); return true; }
  clear() { if (this.current) this.history.push(this.current); this.current = null; this.emit(); }
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  resetForTests() { this.current = null; this.history = []; this.emit(); }
  private emit() { for (const listener of this.listeners) listener(); }
}
export const livingWorkspaceRuntime = new LivingWorkspaceRuntime();
