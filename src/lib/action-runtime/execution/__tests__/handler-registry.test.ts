import { describe, expect, it } from "vitest";

import { createInMemoryHandlerRegistry } from "../handler-registry";
import { HandlerAlreadyRegisteredError, HandlerNotFoundError } from "../execution.errors";
import type { ActionHandler } from "../execution.types";

describe("createInMemoryHandlerRegistry", () => {
  it("registers and looks up a handler", () => {
    const registry = createInMemoryHandlerRegistry();
    const handler: ActionHandler = () => ({ status: "SUCCESS" });

    registry.registerHandler("customer.update", handler);

    expect(registry.hasHandler("customer.update")).toBe(true);
    expect(registry.getHandler("customer.update")).toBe(handler);
  });

  it("lists every registered action name", () => {
    const registry = createInMemoryHandlerRegistry();
    registry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));
    registry.registerHandler("quote.create", () => ({ status: "SUCCESS" }));

    expect([...registry.listHandlers()].sort()).toEqual(["customer.update", "quote.create"]);
  });

  it("rejects registering a duplicate handler for the same action", () => {
    const registry = createInMemoryHandlerRegistry();
    registry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    expect(() => registry.registerHandler("customer.update", () => ({ status: "SUCCESS" }))).toThrow(
      HandlerAlreadyRegisteredError,
    );
  });

  it("throws HandlerNotFoundError for an unregistered action", () => {
    const registry = createInMemoryHandlerRegistry();

    expect(() => registry.getHandler("missing.action")).toThrow(HandlerNotFoundError);
  });

  it("reports hasHandler as false for an unregistered action", () => {
    expect(createInMemoryHandlerRegistry().hasHandler("missing.action")).toBe(false);
  });

  it("does not leak handlers between separate registry instances", () => {
    const registryA = createInMemoryHandlerRegistry();
    const registryB = createInMemoryHandlerRegistry();

    registryA.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    expect(registryB.hasHandler("customer.update")).toBe(false);
  });
});
