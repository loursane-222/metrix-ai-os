import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { INPUT_PRESENCE_DURATION_MS, InputPresenceRuntime } from "../presence";

describe("InputPresenceRuntime", () => {
  it("projects target-scoped finite feedback and expires it", () => {
    let expire: (() => void) | undefined; const runtime = new InputPresenceRuntime((callback, delay) => { expect(delay).toBe(INPUT_PRESENCE_DURATION_MS); expire = callback; return 1 as never; }, vi.fn());
    runtime.set(["field-1", "field-2"], "applied"); expect(runtime.getSnapshot()).toEqual({ "field-1": "applied", "field-2": "applied" }); expire?.(); expect(runtime.getSnapshot()).toEqual({ "field-1": "applied" });
  });
  it("keeps static feedback while disabling motion for reduced-motion users", () => {
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css.replace(/\n/g, " ")).toMatch(/data-executive-target[^}]+animation: none/);
    expect(css).toContain('[data-executive-focus="applied-mutation"]');
  });
  it("keeps field mutation out of the DOM projection boundary", () => {
    const batch = readFileSync(new URL("../batch.ts", import.meta.url), "utf8");
    expect(batch).not.toContain("document."); expect(batch).not.toContain(".value ="); expect(batch).toContain("host.execute");
  });
});
