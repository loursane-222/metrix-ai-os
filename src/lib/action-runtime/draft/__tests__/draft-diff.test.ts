import { describe, expect, it } from "vitest";

import { compareDraft, computeDirtyFields } from "../draft-diff";
import type { DraftSnapshot } from "../draft.types";

function snapshot(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    draftId: "draft_1",
    entityType: "customer",
    entityId: "cust_1",
    baseVersion: 1,
    fieldValues: { phone: "111", email: "a@b.com" },
    dirtyFields: [],
    valid: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeDirtyFields", () => {
  it("returns no dirty fields when values are identical", () => {
    expect(computeDirtyFields({ phone: "111" }, { phone: "111" })).toEqual([]);
  });

  it("detects a changed field", () => {
    expect(computeDirtyFields({ phone: "111" }, { phone: "222" })).toEqual(["phone"]);
  });

  it("detects a newly added field", () => {
    expect(computeDirtyFields({}, { phone: "111" })).toEqual(["phone"]);
  });

  it("detects a removed field", () => {
    expect(computeDirtyFields({ phone: "111" }, {})).toEqual(["phone"]);
  });
});

describe("compareDraft", () => {
  it("produces a diff containing only changed fields", () => {
    const base = snapshot({ fieldValues: { phone: "111", email: "a@b.com" } });
    const current = snapshot({ fieldValues: { phone: "222", email: "a@b.com" } });

    const diff = compareDraft(base, current);

    expect(diff.entityType).toBe("customer");
    expect(diff.entityId).toBe("cust_1");
    expect(diff.changedFields).toEqual({ phone: "222" });
  });

  it("produces an empty diff when nothing changed", () => {
    expect(compareDraft(snapshot(), snapshot()).changedFields).toEqual({});
  });

  it("represents a cleared field as null in the diff", () => {
    const base = snapshot({ fieldValues: { phone: "111" } });
    const current = snapshot({ fieldValues: { phone: null } });

    expect(compareDraft(base, current).changedFields).toEqual({ phone: null });
  });
});
