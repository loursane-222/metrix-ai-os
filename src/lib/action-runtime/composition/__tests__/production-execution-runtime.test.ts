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
    expect(handlerRegistry.listHandlers()).toEqual(["customer.archive", "customer.create", "customer.update"]);
    expect(handlerRegistry.getHandler("customer.update")).toBe(customerUpdateHandler);
  });

  it("never calls executeAction or performs a real Customer mutation just by resolving the handler", () => {
    const executeActionSpy = vi.spyOn(productionExecutionRuntime, "executeAction");

    productionExecutionRuntime.getHandlerRegistry();

    expect(executeActionSpy).not.toHaveBeenCalled();
    executeActionSpy.mockRestore();
  });
});
