import { describe, expect, it } from "vitest";
import { validateWorkspaceDirective } from "../contracts";
import { createWorkspaceDirective } from "../planner";
import { LivingWorkspaceRuntime } from "../runtime";

const base = () => createWorkspaceDirective({ domain: "customer", source: "written", correlationId: "c-1", now: new Date("2026-01-01T00:00:00Z") });

describe("Living Workspace authority", () => {
  it("accepts strict allowlisted directives and rejects free HTML, components, domains, fields and actions", () => {
    const valid = base(); expect(validateWorkspaceDirective(valid)).toEqual(valid);
    expect(validateWorkspaceDirective({ ...valid, html: "<script/>" })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, domain: "admin" })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, surfaces: [{ ...valid.surfaces[0], columns: ["password"] }] })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, surfaces: [{ ...valid.surfaces[0], actions: ["delete-all"] }] })).toBeNull();
  });
  it("rejects stale directives, supersedes current and returns to previous focus", () => {
    const runtime = new LivingWorkspaceRuntime();
    expect(runtime.publish(base())).toBe(false);
    const now = new Date();
    const current = createWorkspaceDirective({ domain: "customer", source: "written", correlationId: "a", now });
    const next = createWorkspaceDirective({ domain: "product", source: "written", correlationId: "b", now: new Date(now.getTime() + 1) });
    expect(runtime.publish(current)).toBe(true); expect(runtime.publish(next)).toBe(true); expect(runtime.getSnapshot()?.domain).toBe("product");
    expect(runtime.back()).toBe(true); expect(runtime.getSnapshot()?.domain).toBe("customer");
  });
  it("produces identical presentation for an already-resolved text or voice command", () => {
    const now = new Date();
    const written = createWorkspaceDirective({ domain: "product", source: "written", correlationId: "w", now });
    const voice = createWorkspaceDirective({ domain: "product", source: "voice", correlationId: "v", now });
    const comparable = (value: typeof written) => ({ ...value, directiveId: "", correlationId: "", source: "", primarySurfaceId: "", surfaces: value.surfaces.map((surface) => ({ ...surface, surfaceId: "" })) });
    expect(comparable(written)).toEqual(comparable(voice));
  });
  it("does not accept natural-language utterances as planner input", () => {
    expect(createWorkspaceDirective.length).toBe(1);
    expect(JSON.stringify(base())).not.toContain("utterance");
  });
});
