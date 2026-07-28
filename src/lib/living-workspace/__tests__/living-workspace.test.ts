import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateWorkspaceDirective } from "../contracts";
import { planWorkspaceDirective } from "../planner";
import { LivingWorkspaceRuntime, livingWorkspaceRuntime } from "../runtime";

vi.mock("@/lib/conversation-extensions/conversation-navigation-runtime", () => ({ dispatchConversationNavigation: vi.fn() }));
const base = () => planWorkspaceDirective({ utterance: "Müşterileri göster.", source: "written", correlationId: "c-1", now: new Date("2026-01-01T00:00:00Z") })!;

describe("Living Workspace authority", () => {
  beforeEach(() => livingWorkspaceRuntime.resetForTests());
  it("accepts strict allowlisted directives and rejects free HTML, components, domains, fields and actions", () => {
    const valid = base(); expect(validateWorkspaceDirective(valid)).toEqual(valid);
    expect(validateWorkspaceDirective({ ...valid, html: "<script/>" })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, domain: "admin" })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, surfaces: [{ ...valid.surfaces[0], columns: ["password"] }] })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, surfaces: [{ ...valid.surfaces[0], actions: ["delete-all"] }] })).toBeNull();
  });
  it("rejects stale directives, supersedes current and returns to previous focus", () => {
    const runtime = new LivingWorkspaceRuntime(); const first = base();
    expect(runtime.publish(first)).toBe(false);
    const now = new Date(); const current = planWorkspaceDirective({ utterance: "Müşterileri göster", source: "written", correlationId: "a", now })!;
    const next = planWorkspaceDirective({ utterance: "Ürünleri göster", source: "written", correlationId: "b", now: new Date(now.getTime() + 1) })!;
    expect(runtime.publish(current)).toBe(true); expect(runtime.publish(next)).toBe(true); expect(runtime.getSnapshot()?.domain).toBe("product");
    expect(runtime.back()).toBe(true); expect(runtime.getSnapshot()?.domain).toBe("customer");
  });
  it("produces identical typed presentation for written and voice and refines product continuity", () => {
    const now = new Date();
    const written = planWorkspaceDirective({ utterance: "Stoklu ürünleri göster", source: "written", correlationId: "w", now })!;
    const voice = planWorkspaceDirective({ utterance: "Stoklu ürünleri göster", source: "voice", correlationId: "v", now })!;
    const comparable = (value: typeof written) => ({ ...value, directiveId: "", correlationId: "", source: "", primarySurfaceId: "", surfaces: value.surfaces.map((surface) => ({ ...surface, surfaceId: "" })) });
    expect(comparable(written)).toEqual(comparable(voice));
    livingWorkspaceRuntime.publish(written);
    const refined = planWorkspaceDirective({ utterance: "500 TL üzerindekiler", source: "written", correlationId: "r", now: new Date(now.getTime() + 1) })!;
    expect(refined.replacePolicy).toBe("refine");
    expect(refined.surfaces[0].filters).toEqual(expect.arrayContaining([expect.objectContaining({ field: "stock" }), expect.objectContaining({ field: "priceCents", value: 50_000 })]));
  });
  it.each(["Şirketimin genel durumunu göster.","Müşterileri göster.","Borcu geçen müşterileri göster.","Atlas müşterisini aç.","Ürünleri göster.","Stoklu ürünleri göster.","Fiyatı 500 TL üzerindeki stoklu ürünleri göster."])("maps production intent: %s", (utterance) => {
    expect(planWorkspaceDirective({ utterance, source: "written", correlationId: "intent", now: new Date() })).not.toBeNull();
  });
});
