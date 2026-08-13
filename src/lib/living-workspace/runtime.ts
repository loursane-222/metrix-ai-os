import { validateWorkspaceDirective, type WorkspaceDirective } from "./contracts";

export class LivingWorkspaceRuntime {
  private current: WorkspaceDirective | null = null;
  private history: WorkspaceDirective[] = [];
  private listeners = new Set<() => void>();
  private surfaceOpen = false;
  private surfaceOpenListeners = new Set<() => void>();
  publish(input: unknown) {
    const next = validateWorkspaceDirective(input);
    if (!next || Date.parse(next.expiresAt) <= Date.now()) return false;
    if (this.current && Date.parse(next.generatedAt) < Date.parse(this.current.generatedAt)) return false;
    if (this.current) this.history.push(this.current);
    this.current = next; this.setSurfaceOpen(false); this.emit(); return true;
  }
  back() { const previous = this.history.pop(); if (!previous) return false; this.current = previous; this.setSurfaceOpen(false); this.emit(); return true; }
  clear() { if (this.current) this.history.push(this.current); this.current = null; this.setSurfaceOpen(false); this.emit(); }
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSurfaceOpenSnapshot = () => this.surfaceOpen;
  subscribeSurfaceOpen = (listener: () => void) => { this.surfaceOpenListeners.add(listener); return () => this.surfaceOpenListeners.delete(listener); };
  setSurfaceOpen = (open: boolean) => { if (this.surfaceOpen === open) return; this.surfaceOpen = open; for (const listener of this.surfaceOpenListeners) listener(); };
  resetForTests() { this.current = null; this.history = []; this.setSurfaceOpen(false); this.emit(); }
  private emit() { for (const listener of this.listeners) listener(); }
}
export const livingWorkspaceRuntime = new LivingWorkspaceRuntime();
