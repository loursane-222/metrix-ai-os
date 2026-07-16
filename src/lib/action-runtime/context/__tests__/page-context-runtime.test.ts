import { describe, expect, it } from "vitest";

import { createPageContextRuntime } from "../page-context-runtime";
import { ContextAlreadyExistsError, InvalidPageContextInputError, NoActiveContextError } from "../page-context.errors";
import type { PageContextInput } from "../page-context.types";

function baseInput(overrides: Partial<PageContextInput> = {}): PageContextInput {
  return {
    module: "customers",
    surface: "detail",
    route: "/metrix/customers/cust_1",
    entityType: "customer",
    entityId: "cust_1",
    activeTab: "overview",
    activeForm: null,
    activeDraftId: null,
    selection: [],
    ...overrides,
  };
}

describe("PageContextRuntime — create", () => {
  it("creates the first context at version 1", () => {
    const runtime = createPageContextRuntime();

    const snapshot = runtime.createContext(baseInput());

    expect(snapshot.version).toBe(1);
    expect(snapshot.module).toBe("customers");
    expect(snapshot.entityId).toBe("cust_1");
    expect(runtime.getCurrentContext()).toEqual(snapshot);
  });

  it("rejects creating a context when one is already active", () => {
    const runtime = createPageContextRuntime();
    runtime.createContext(baseInput());

    expect(() => runtime.createContext(baseInput())).toThrow(ContextAlreadyExistsError);
  });

  it("rejects structurally invalid input", () => {
    const runtime = createPageContextRuntime();

    expect(() => runtime.createContext(baseInput({ module: "" }))).toThrow(InvalidPageContextInputError);
  });
});

describe("PageContextRuntime — replace (module değişimi)", () => {
  it("fully swaps the context into a different module and bumps the version", () => {
    const runtime = createPageContextRuntime();
    const first = runtime.createContext(baseInput({ module: "customers", entityId: "cust_1" }));

    const second = runtime.replaceContext(
      baseInput({
        module: "quotes",
        surface: "create",
        route: "/metrix/quotes/new",
        entityType: "quote",
        entityId: null,
        activeTab: null,
      }),
    );

    expect(second.module).toBe("quotes");
    expect(second.entityType).toBe("quote");
    expect(second.entityId).toBeNull();
    expect(second.version).toBe(first.version + 1);
    expect(runtime.getCurrentContext()).toEqual(second);
  });

  it("rejects replacing a context when none exists", () => {
    const runtime = createPageContextRuntime();

    expect(() => runtime.replaceContext(baseInput())).toThrow(NoActiveContextError);
  });
});

describe("PageContextRuntime — update", () => {
  it("merges a partial update onto the current context (activeDraft değişimi)", () => {
    const runtime = createPageContextRuntime();
    const first = runtime.createContext(baseInput({ activeDraftId: null }));

    const second = runtime.updateContext({ activeDraftId: "draft_9" });

    expect(second.activeDraftId).toBe("draft_9");
    expect(second.module).toBe(first.module);
    expect(second.entityId).toBe(first.entityId);
    expect(second.version).toBe(first.version + 1);
  });

  it("changes only the entity while preserving the rest of the context (entity değişimi)", () => {
    const runtime = createPageContextRuntime();
    const first = runtime.createContext(baseInput({ entityId: "cust_1" }));

    const second = runtime.updateContext({ entityId: "cust_2" });

    expect(second.entityId).toBe("cust_2");
    expect(second.module).toBe(first.module);
    expect(second.surface).toBe(first.surface);
    expect(second.activeTab).toBe(first.activeTab);
    expect(second.version).toBe(first.version + 1);
  });

  it("allows explicitly clearing a nullable field with null", () => {
    const runtime = createPageContextRuntime();
    runtime.createContext(baseInput({ activeDraftId: "draft_1" }));

    const updated = runtime.updateContext({ activeDraftId: null });

    expect(updated.activeDraftId).toBeNull();
  });

  it("keeps an unspecified field untouched when the value is undefined", () => {
    const runtime = createPageContextRuntime();
    runtime.createContext(baseInput({ activeTab: "overview" }));

    const updated = runtime.updateContext({ activeDraftId: "draft_1" });

    expect(updated.activeTab).toBe("overview");
  });

  it("rejects updating when no context is active", () => {
    const runtime = createPageContextRuntime();

    expect(() => runtime.updateContext({ activeTab: "financial" })).toThrow(NoActiveContextError);
  });
});

describe("PageContextRuntime — clear", () => {
  it("clears the active context", () => {
    const runtime = createPageContextRuntime();
    runtime.createContext(baseInput());

    runtime.clearContext();

    expect(runtime.getCurrentContext()).toBeNull();
  });

  it("allows creating a new context again after clearing", () => {
    const runtime = createPageContextRuntime();
    runtime.createContext(baseInput());
    runtime.clearContext();

    const snapshot = runtime.createContext(baseInput({ module: "quotes" }));

    expect(snapshot.module).toBe("quotes");
  });
});

describe("PageContextRuntime — immutable snapshot", () => {
  it("does not mutate a previous snapshot when the context changes", () => {
    const runtime = createPageContextRuntime();
    const first = runtime.createContext(baseInput({ activeTab: "overview" }));

    runtime.updateContext({ activeTab: "financial" });

    expect(first.activeTab).toBe("overview");
  });

  it("freezes the returned snapshot object", () => {
    const runtime = createPageContextRuntime();
    const snapshot = runtime.createContext(baseInput());

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      (snapshot as { activeTab: string | null }).activeTab = "hacked";
    }).toThrow();
  });

  it("freezes the selection array", () => {
    const runtime = createPageContextRuntime();
    const snapshot = runtime.createContext(baseInput({ selection: ["a", "b"] }));

    expect(Object.isFrozen(snapshot.selection)).toBe(true);
  });
});

describe("PageContextRuntime — version artışı", () => {
  it("increases the version on every mutation, regardless of operation kind", () => {
    const runtime = createPageContextRuntime();
    const v1 = runtime.createContext(baseInput());
    const v2 = runtime.updateContext({ activeTab: "financial" });
    const v3 = runtime.replaceContext(baseInput({ module: "quotes" }));

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v3.version).toBe(3);
  });
});

describe("PageContextRuntime — snapshot karşılaştırması (compareVersion)", () => {
  it("returns the version difference between two snapshots", () => {
    const runtime = createPageContextRuntime();
    const v1 = runtime.createContext(baseInput());
    const v2 = runtime.updateContext({ activeTab: "financial" });

    expect(runtime.compareVersion(v2, v1)).toBe(1);
    expect(runtime.compareVersion(v1, v2)).toBe(-1);
    expect(runtime.compareVersion(v1, v1)).toBe(0);
  });
});

describe("PageContextRuntime — stale detection (isStale)", () => {
  it("treats any reference as stale when there is no active context", () => {
    const runtime = createPageContextRuntime();

    expect(runtime.isStale(1)).toBe(true);
  });

  it("treats a matching version or snapshot as fresh", () => {
    const runtime = createPageContextRuntime();
    const snapshot = runtime.createContext(baseInput());

    expect(runtime.isStale(snapshot)).toBe(false);
    expect(runtime.isStale(snapshot.version)).toBe(false);
  });

  it("treats an older version as stale after a mutation", () => {
    const runtime = createPageContextRuntime();
    const snapshot = runtime.createContext(baseInput());
    runtime.updateContext({ activeTab: "financial" });

    expect(runtime.isStale(snapshot)).toBe(true);
    expect(runtime.isStale(snapshot.version)).toBe(true);
  });
});

describe("PageContextRuntime — captureSnapshot", () => {
  it("returns the current snapshot", () => {
    const runtime = createPageContextRuntime();
    const created = runtime.createContext(baseInput());

    expect(runtime.captureSnapshot()).toEqual(created);
  });

  it("throws when there is no active context", () => {
    const runtime = createPageContextRuntime();

    expect(() => runtime.captureSnapshot()).toThrow(NoActiveContextError);
  });
});

describe("PageContextRuntime — injected clock", () => {
  it("uses the injected clock to stamp capturedAt", () => {
    let currentMs = 1_000;
    const runtime = createPageContextRuntime({ clock: () => new Date(currentMs) });

    const first = runtime.createContext(baseInput());
    currentMs = 2_000;
    const second = runtime.updateContext({ activeTab: "financial" });

    expect(first.capturedAt).toBe(new Date(1_000).toISOString());
    expect(second.capturedAt).toBe(new Date(2_000).toISOString());
  });
});
