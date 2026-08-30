import { describe, expect, it, vi } from "vitest";

// customerUpdateHandler transitively imports customer.service -> the real
// Prisma client, which throws at import time without DATABASE_URL. Must be
// mocked before importing anything that pulls in this composition root
// (it registers customer.update on its own handler registry as a
// module-level side effect).
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { productionExecutionRuntime } from "../production-execution-runtime";
import { customerUpdateHandler, registerCustomerActions } from "../../domains/customers";

describe("production ExecutionRuntime composition", () => {
  it("resolves the real customer.update handler from the production handler registry", () => {
    const handlerRegistry = productionExecutionRuntime.getHandlerRegistry();

    expect(handlerRegistry.hasHandler("customer.update")).toBe(true);
    expect(handlerRegistry.getHandler("customer.update")).toBe(customerUpdateHandler);
  });

  it("keeps registerCustomerActions duplicate-safe when re-run against the production registry", () => {
    const handlerRegistry = productionExecutionRuntime.getHandlerRegistry();

    expect(() => registerCustomerActions(handlerRegistry)).not.toThrow();
    expect(handlerRegistry.listHandlers()).toEqual([
      "collection.set_lifecycle",
      "collection.start",
      "company.field_definition.create",
      "company.field_definition.deprecate",
      "company.field_value.write",
      "company.goal.upsert",
      "company.profile.update",
      "company.unit.archive",
      "company.unit.create",
      "company.unit.update",
      "custom_field.create",
      "custom_field.deprecate",
      "custom_field.update_definition",
      "customer.archive",
      "customer.create",
      "customer.unarchive",
      "customer.update",
      "delivery.cancel",
      "delivery.create",
      "delivery.transitionStatus",
      "executive_action.cancel",
      "executive_action.complete",
      "executive_action.create",
      "expense.cancel",
      "expense.create",
      "expense.settle",
      "expense.settlement.reverse",
      "expense.update",
      "field_visit.create",
      "financial_account.create",
      "financial_account.deactivate",
      "financial_account.update",
      "goodsReceipt.cancel",
      "goodsReceipt.createFromPurchaseOrder",
      "integration.bizimhesap.push_invoice",
      "invoice.create",
      "invoice.send",
      "invoice.void",
      "machine.archive",
      "machine.create",
      "obligation.materializePayable",
      "obligation.materializeReceivable",
      "order.cancel",
      "order.create",
      "order.transitionStatus",
      "payment.apply",
      "payment.create",
      "payment.void",
      "product.archive",
      "product.create",
      "production.archive",
      "production.create",
      "production.update",
      "purchaseInvoice.confirm",
      "purchaseInvoice.createFromPurchaseOrder",
      "purchaseInvoice.void",
      "purchaseOrder.cancel",
      "purchaseOrder.create",
      "purchaseOrder.transitionStatus",
      "quote.create",
      "quote.dispatch",
      "quote.send",
      "quote.set_lifecycle",
      "quote.update",
      "settlement.reverse",
      "stock.adjustment",
      "stock.receive",
      "stock.transfer",
      "supplier.archive",
      "supplier.create",
      "supplier.update",
      "supplierPayment.apply",
      "supplierPayment.reverse",
      "task.cancel",
      "task.complete",
      "task.create",
      "warehouse.archive",
      "warehouse.create",
      "workCenter.archive",
      "workCenter.create",
    ]);
    expect(handlerRegistry.getHandler("customer.update")).toBe(customerUpdateHandler);
  });

  it("never calls executeAction or performs a real Customer mutation just by resolving the handler", () => {
    const executeActionSpy = vi.spyOn(productionExecutionRuntime, "executeAction");

    productionExecutionRuntime.getHandlerRegistry();

    expect(executeActionSpy).not.toHaveBeenCalled();
    executeActionSpy.mockRestore();
  });
});
