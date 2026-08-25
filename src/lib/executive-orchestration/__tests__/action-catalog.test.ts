import { describe, expect, it, vi } from "vitest";

// action-catalog.ts imports entity-resolvers.ts for ENTITY_REFERENCE_FIELDS
// (pure data), which transitively imports every domain's list() service and
// therefore prisma.ts — stub it so loading this module doesn't require a
// real DATABASE_URL; nothing in this file executes a real query.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

const { listPlannableActions, buildActionCatalog } = await import("../action-catalog");

describe("listPlannableActions", () => {
  it("only includes DOMAIN actions with approvalPolicy NONE or EXPLICIT and a non-empty schema", () => {
    const actions = listPlannableActions();
    expect(actions.length).toBeGreaterThan(15);
    for (const action of actions) {
      expect(action.actionClass).toBe("DOMAIN");
      expect(["NONE", "EXPLICIT"]).toContain(action.approvalPolicy);
      expect(Object.keys(action.inputSchema).length).toBeGreaterThan(0);
    }
    // CONDITIONAL and surface actions must never leak in.
    expect(actions.some((a) => a.actionName === "payment.apply")).toBe(false);
    expect(actions.some((a) => a.actionName === "surface.navigate")).toBe(false);
  });

  it("includes the Büyük Resim Faz 2 actions now that their manifests have real schemas and handlers", () => {
    const actions = listPlannableActions();
    for (const actionName of ["order.transitionStatus", "order.cancel", "production.update", "production.archive", "workCenter.create", "machine.create", "stock.transfer", "stock.adjustment", "warehouse.create", "supplier.archive"]) {
      expect(actions.some((a) => a.actionName === actionName)).toBe(true);
    }
  });

  it("includes approval-gated actions (quote.dispatch, customer.archive) with a resolvable entity-reference field", () => {
    const actions = listPlannableActions();
    expect(actions.some((a) => a.actionName === "quote.dispatch")).toBe(true);
    expect(actions.some((a) => a.actionName === "customer.archive")).toBe(true);
  });

  it("excludes approval-gated actions whose entity reference has no resolver yet", () => {
    const actions = listPlannableActions();
    expect(actions.some((a) => a.actionName === "executive_action.complete")).toBe(false);
    expect(actions.some((a) => a.actionName === "collection.set_lifecycle")).toBe(false);
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

  it("flags requiresApproval correctly for EXPLICIT vs NONE actions", () => {
    const catalog = buildActionCatalog();
    expect(catalog.find((a) => a.actionName === "quote.dispatch")?.requiresApproval).toBe(true);
    expect(catalog.find((a) => a.actionName === "quote.create")?.requiresApproval).toBe(false);
  });

  it("flags the new Faz 2 entity-reference fields (productionOrderId, warehouseId, workCenterId) for resolution", () => {
    const catalog = buildActionCatalog();
    const productionArchive = catalog.find((action) => action.actionName === "production.archive");
    expect(productionArchive!.fields.find((field) => field.name === "productionOrderId")?.isEntityReference).toBe(true);
    const stockTransfer = catalog.find((action) => action.actionName === "stock.transfer");
    expect(stockTransfer!.fields.find((field) => field.name === "fromWarehouseId")?.isEntityReference).toBe(true);
    expect(stockTransfer!.fields.find((field) => field.name === "toWarehouseId")?.isEntityReference).toBe(true);
    const machineCreate = catalog.find((action) => action.actionName === "machine.create");
    expect(machineCreate!.fields.find((field) => field.name === "workCenterId")?.isEntityReference).toBe(true);
    const supplierArchive = catalog.find((action) => action.actionName === "supplier.archive");
    expect(supplierArchive!.fields.find((field) => field.name === "supplierId")?.isEntityReference).toBe(true);
  });
});
