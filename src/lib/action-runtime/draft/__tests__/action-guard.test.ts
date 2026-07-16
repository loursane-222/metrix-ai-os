import { describe, expect, it } from "vitest";

import { actionRegistry } from "../../registry";
import { assertSurfaceAction } from "../action-guard";
import { DomainActionRejectedError } from "../draft.errors";

describe("assertSurfaceAction — domain action rejection", () => {
  it("accepts a registered SURFACE action", () => {
    expect(() => assertSurfaceAction(actionRegistry, "draft.set_field")).not.toThrow();
  });

  it("rejects a registered DOMAIN action", () => {
    expect(() => assertSurfaceAction(actionRegistry, "customer.update")).toThrow(DomainActionRejectedError);
  });

  it("carries the offending action's actual class on the thrown error", () => {
    try {
      assertSurfaceAction(actionRegistry, "customer.archive");
      throw new Error("expected assertSurfaceAction to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainActionRejectedError);
      expect((error as DomainActionRejectedError).actualActionClass).toBe("DOMAIN");
      expect((error as DomainActionRejectedError).actionName).toBe("customer.archive");
    }
  });
});
