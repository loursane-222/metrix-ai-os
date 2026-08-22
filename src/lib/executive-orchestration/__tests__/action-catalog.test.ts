import { describe, expect, it, vi } from "vitest";

// action-catalog.ts imports entity-resolvers.ts for ENTITY_REFERENCE_FIELDS
// (pure data), which transitively imports every domain's list() service and
// therefore prisma.ts — stub it so loading this module doesn't require a
// real DATABASE_URL; nothing in this file executes a real query.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

const { listPlannableActions, buildActionCatalog } = await import("../action-catalog");

describe("listPlannableActions", () => {
  it("only includes DOMAIN actions with approvalPolicy NONE and a non-empty schema", () => {
    const actions = listPlannableActions();
    expect(actions.length).toBeGreaterThan(15);
    for (const action of actions) {
      expect(action.actionClass).toBe("DOMAIN");
      expect(action.approvalPolicy).toBe("NONE");
      expect(Object.keys(action.inputSchema).length).toBeGreaterThan(0);
    }
    // Explicit-approval and empty-schema actions must never leak in.
    expect(actions.some((a) => a.actionName === "quote.dispatch")).toBe(false);
    expect(actions.some((a) => a.actionName === "customer.archive")).toBe(false);
    expect(actions.some((a) => a.actionName === "surface.navigate")).toBe(false);
  });

  it("includes delivery.create now that its manifest has a real schema", () => {
    const actions = listPlannableActions();
    expect(actions.some((a) => a.actionName === "delivery.create")).toBe(true);
  });
});

describe("buildActionCatalog", () => {
  it("flags known entity-reference fields (e.g. quote.create.customerId) for resolution", () => {
    const catalog = buildActionCatalog();
    const quoteCreate = catalog.find((action) => action.actionName === "quote.create");
    expect(quoteCreate).toBeDefined();
    const customerField = quoteCreate!.fields.find((field) => field.name === "customerId");
    expect(customerField?.isEntityReference).toBe(true);
    const titleField = quoteCreate!.fields.find((field) => field.name === "title");
    expect(titleField?.isEntityReference).toBe(false);
  });
});
