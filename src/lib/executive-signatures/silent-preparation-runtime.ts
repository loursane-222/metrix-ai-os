"use client";

type PreparedEntry = Readonly<{ payload: unknown; preparedAt: number }>;

class SilentPreparationRuntime {
  private active: { key: string; controller: AbortController } | null = null;
  private cache = new Map<string, PreparedEntry>();
  private listeners = new Set<() => void>();
  prepare(key: string, endpoint: string) {
    if (this.active?.key === key || this.cache.has(key)) return;
    this.cancel();
    const controller = new AbortController();
    this.active = { key, controller }; this.emit();
    void fetch(endpoint, { credentials: "include", signal: controller.signal })
      .then(async (response) => { const payload = await response.json(); if (!response.ok || !payload?.ok) throw new Error("canonical prefetch failed"); if (this.active?.key === key) this.cache.set(key, { payload, preparedAt: Date.now() }); })
      .catch(() => undefined)
      .finally(() => { if (this.active?.key === key) this.active = null; this.emit(); });
  }
  cancel() { this.active?.controller.abort(); this.active = null; this.emit(); }
  consume(key: string): unknown | null {
    // Cancel any in-flight prepare for this key: if consume is called before the prepare fetch
    // completes, the fetch would race and store stale data to the cache after consume clears it.
    if (this.active?.key === key) this.cancel();
    const entry = this.cache.get(key);
    if (!entry || Date.now() - entry.preparedAt > 30_000) return null;
    this.cache.delete(key); return entry.payload;
  }
  getSnapshot = () => this.active?.key ?? null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private emit() { for (const listener of this.listeners) listener(); }
}

/** Signature 05: sessiz.hazirlik — read-only canonical data warming. */
export const silentPreparationRuntime = new SilentPreparationRuntime();
