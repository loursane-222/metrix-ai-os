import { describe, expect, it } from "vitest";
import { createPageContextRuntime } from "../../context";
import { createDraftRuntime } from "../draft-runtime";
import type { ExecutiveLifecycleEnvelope } from "@/lib/executive-lifecycle";

describe("Draft Runtime lifecycle adapter", () => {
  it("emits only successful real create/update/commit/discard transitions", () => {
    const envelopes: ExecutiveLifecycleEnvelope[] = [];
    const pageContext = createPageContextRuntime();
    pageContext.createContext({ module: "customers", surface: "edit", route: "/customers/1", entityType: "customer", entityId: "1", activeDraftId: "draft-1" });
    const runtime = createDraftRuntime({ pageContext, lifecycleSink: (envelope) => envelopes.push(envelope), clock: () => new Date("2026-01-01T00:00:00Z") });
    runtime.createDraft({ draftId: "draft-1", entityType: "customer", entityId: "1", fieldValues: { name: "A" } });
    runtime.updateField("draft-1", "name", "B");
    runtime.commitDraft("draft-1");
    runtime.discardDraft("draft-1");
    expect(envelopes.map((envelope) => envelope.phase)).toEqual(["created", "updated", "committed", "discarded"]);
    expect(envelopes[1]).toMatchObject({ source: "draft", draft: { draftId: "draft-1", changedFields: ["name"] } });
  });

  it("emits a failed lifecycle and preserves the real commit exception", () => {
    const envelopes: ExecutiveLifecycleEnvelope[] = [];
    const pageContext = createPageContextRuntime();
    pageContext.createContext({ module: "customers", surface: "edit", route: "/customers/1", entityType: "customer", entityId: "1", activeDraftId: "draft-1" });
    const runtime = createDraftRuntime({ pageContext, lifecycleSink: (envelope) => envelopes.push(envelope) });
    runtime.createDraft({ draftId: "draft-1", entityType: "customer", entityId: "1", fieldValues: { name: "A" } });
    pageContext.updateContext({ activeTab: "other" });
    expect(() => runtime.commitDraft("draft-1")).toThrow();
    expect(envelopes.at(-1)).toMatchObject({ source: "draft", phase: "failed", status: "failed" });
  });
});
