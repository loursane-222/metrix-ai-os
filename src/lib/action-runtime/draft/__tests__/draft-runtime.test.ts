import { describe, expect, it } from "vitest";

import { createPageContextRuntime } from "../../context";
import type { PageContextInput } from "../../context/page-context.types";
import { createDraftRuntime } from "../draft-runtime";
import {
  ContextMismatchError,
  DraftNotFoundError,
  EntityMismatchError,
  VersionMismatchError,
} from "../draft.errors";

function baseContextInput(overrides: Partial<PageContextInput> = {}): PageContextInput {
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

function setupRuntimes(contextInput: Partial<PageContextInput> = {}) {
  const pageContext = createPageContextRuntime();
  pageContext.createContext(baseContextInput(contextInput));
  const draftRuntime = createDraftRuntime({ pageContext });
  return { pageContext, draftRuntime };
}

describe("DraftRuntime — create draft", () => {
  it("creates a draft grounded in the active page context", () => {
    const { draftRuntime } = setupRuntimes();

    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111", email: "a@b.com" },
    });

    expect(draft.entityType).toBe("customer");
    expect(draft.entityId).toBe("cust_1");
    expect(draft.baseVersion).toBe(1);
    expect(draft.dirtyFields).toEqual([]);
    expect(draft.valid).toBe(true);
  });

  it("rejects creation when there is no active page context", () => {
    const pageContext = createPageContextRuntime();
    const draftRuntime = createDraftRuntime({ pageContext });

    expect(() =>
      draftRuntime.createDraft({ entityType: "customer", entityId: "cust_1", fieldValues: {} }),
    ).toThrow(ContextMismatchError);
  });

  it("rejects creation when the target entity does not match the active context", () => {
    const { draftRuntime } = setupRuntimes();

    expect(() =>
      draftRuntime.createDraft({ entityType: "customer", entityId: "cust_OTHER", fieldValues: {} }),
    ).toThrow(EntityMismatchError);
  });
});

describe("DraftRuntime — update field", () => {
  it("changes only the targeted field", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111", email: "a@b.com" },
    });

    const updated = draftRuntime.updateField(draft.draftId, "phone", "222");

    expect(updated.fieldValues.phone).toBe("222");
    expect(updated.fieldValues.email).toBe("a@b.com");
    expect(updated.dirtyFields).toEqual(["phone"]);
  });

  it("is a no-op on dirtiness when the new value equals the baseline", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    draftRuntime.updateField(draft.draftId, "phone", "222");
    const reverted = draftRuntime.updateField(draft.draftId, "phone", "111");

    expect(reverted.dirtyFields).toEqual([]);
    expect(reverted.fieldValues.phone).toBe("111");
  });

  it("throws for an unknown draft", () => {
    const { draftRuntime } = setupRuntimes();

    expect(() => draftRuntime.updateField("missing", "phone", "1")).toThrow(DraftNotFoundError);
  });
});

describe("DraftRuntime — clear field", () => {
  it("sets the field to null and marks it dirty", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    const cleared = draftRuntime.clearField(draft.draftId, "phone");

    expect(cleared.fieldValues.phone).toBeNull();
    expect(cleared.dirtyFields).toEqual(["phone"]);
  });
});

describe("DraftRuntime — revert field", () => {
  it("restores the field to its baseline value", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    draftRuntime.updateField(draft.draftId, "phone", "222");
    const reverted = draftRuntime.revertField(draft.draftId, "phone");

    expect(reverted.fieldValues.phone).toBe("111");
    expect(reverted.dirtyFields).toEqual([]);
  });
});

describe("DraftRuntime — discard", () => {
  it("removes the draft entirely", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    draftRuntime.discardDraft(draft.draftId);

    expect(() => draftRuntime.captureDraft(draft.draftId)).toThrow(DraftNotFoundError);
  });

  it("throws when discarding an unknown draft", () => {
    const { draftRuntime } = setupRuntimes();

    expect(() => draftRuntime.discardDraft("missing")).toThrow(DraftNotFoundError);
  });
});

describe("DraftRuntime — commit diff", () => {
  it("produces a ResolvedDomainActionRequest containing only the changed fields as patch", () => {
    const { draftRuntime, pageContext } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111", email: "a@b.com" },
    });

    draftRuntime.updateField(draft.draftId, "phone", "222");

    const request = draftRuntime.commitDraft(draft.draftId);

    expect(request.actionName).toBe("customer.update");
    expect(request.entityRef).toEqual({ entityType: "customer", entityId: "cust_1" });
    expect(request.patch).toEqual({ phone: "222" });
    expect(request.originatingDraftId).toBe(draft.draftId);
    expect(request.originatingContextVersion).toBe(pageContext.getCurrentContext()?.version);
  });

  it("never executes anything — the draft remains available afterwards", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });
    draftRuntime.updateField(draft.draftId, "phone", "222");

    draftRuntime.commitDraft(draft.draftId);

    expect(() => draftRuntime.captureDraft(draft.draftId)).not.toThrow();
  });
});

describe("DraftRuntime — immutable snapshot", () => {
  it("does not mutate a previous snapshot when the draft changes", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    draftRuntime.updateField(draft.draftId, "phone", "222");

    expect(draft.fieldValues.phone).toBe("111");
  });

  it("freezes the returned snapshot", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    expect(Object.isFrozen(draft)).toBe(true);
    expect(() => {
      (draft as { fieldValues: Record<string, unknown> }).fieldValues = {};
    }).toThrow();
  });
});

describe("DraftRuntime — compare draft", () => {
  it("delegates to the pure compareDraft utility", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });
    const updated = draftRuntime.updateField(draft.draftId, "phone", "222");

    const diff = draftRuntime.compareDraft(draft, updated);

    expect(diff.changedFields).toEqual({ phone: "222" });
  });
});

describe("DraftRuntime — dirty fields", () => {
  it("tracks multiple dirty fields independently", () => {
    const { draftRuntime } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111", email: "a@b.com" },
    });

    draftRuntime.updateField(draft.draftId, "phone", "222");
    const updated = draftRuntime.updateField(draft.draftId, "email", "c@d.com");

    expect([...updated.dirtyFields].sort()).toEqual(["email", "phone"]);
  });
});

describe("DraftRuntime — context mismatch", () => {
  it("rejects mutating operations once the page context is cleared", () => {
    const { draftRuntime, pageContext } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    pageContext.clearContext();

    expect(() => draftRuntime.updateField(draft.draftId, "phone", "222")).toThrow(ContextMismatchError);
    expect(() => draftRuntime.commitDraft(draft.draftId)).toThrow(ContextMismatchError);
  });
});

describe("DraftRuntime — entity mismatch", () => {
  it("rejects committing once the page context points to a different entity", () => {
    const { draftRuntime, pageContext } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    pageContext.replaceContext(baseContextInput({ entityId: "cust_2", route: "/metrix/customers/cust_2" }));

    expect(() => draftRuntime.commitDraft(draft.draftId)).toThrow(EntityMismatchError);
  });
});

describe("DraftRuntime — version mismatch", () => {
  it("rejects committing once the page context has moved on, even for the same entity", () => {
    const { draftRuntime, pageContext } = setupRuntimes();
    const draft = draftRuntime.createDraft({
      entityType: "customer",
      entityId: "cust_1",
      fieldValues: { phone: "111" },
    });

    pageContext.updateContext({ activeTab: "financial" });

    expect(() => draftRuntime.commitDraft(draft.draftId)).toThrow(VersionMismatchError);
  });
});
