import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { createInMemoryHandlerRegistry } from "../../../execution";
import { customerUpdateHandler } from "../customer-update-handler";
import { registerCustomerActions } from "../register-customer-actions";

describe("registerCustomerActions", () => {
  it("registers the customer.update handler", () => {
    const handlerRegistry = createInMemoryHandlerRegistry();

    registerCustomerActions(handlerRegistry);

    expect(handlerRegistry.hasHandler("customer.update")).toBe(true);
    expect(handlerRegistry.getHandler("customer.update")).toBe(customerUpdateHandler);
  });

  it("is idempotent — calling it twice does not throw or duplicate-register", () => {
    const handlerRegistry = createInMemoryHandlerRegistry();

    registerCustomerActions(handlerRegistry);
    expect(() => registerCustomerActions(handlerRegistry)).not.toThrow();

    expect(handlerRegistry.listHandlers()).toEqual(["customer.archive", "customer.create", "customer.update"]);
  });

  it("does not register anything if the handler is already present under that name", () => {
    const handlerRegistry = createInMemoryHandlerRegistry();
    let callCount = 0;
    handlerRegistry.registerHandler("customer.update", () => {
      callCount += 1;
      return { status: "SUCCESS" };
    });

    registerCustomerActions(handlerRegistry);

    expect(handlerRegistry.getHandler("customer.update")).not.toBe(customerUpdateHandler);
    expect(callCount).toBe(0);
  });
});
