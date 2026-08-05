import { describe, expect, it } from "vitest";
import { INITIAL_PRODUCT_EXPERIENCE_STATE, projectionFromCommand, reduceProductExperience, resolveProductExperienceTarget } from "../product-experience";

describe("Product Experience owner", () => {
  it("claims only customer detail and create canonical targets", () => {
    expect(resolveProductExperienceTarget({ route: "/metrix/customers/customer-1", expectedSurfaceAuthorityKey: "customers.detail.page" })).toEqual({ surface: "customer.detail", customerId: "customer-1" });
    expect(resolveProductExperienceTarget({ route: "/metrix/customers/new", expectedSurfaceAuthorityKey: "customers.customer.create" })).toEqual({ surface: "customer.create" });
    expect(resolveProductExperienceTarget({ route: "/metrix/customers/customer-1/edit", expectedSurfaceAuthorityKey: "customers.edit.page" })).toBeNull();
    expect(resolveProductExperienceTarget({ route: "/metrix/tasks/new", expectedSurfaceAuthorityKey: "tasks.task.create" })).toBeNull();
  });

  it("ignores stale surface acknowledgements", () => {
    const first = reduceProductExperience(INITIAL_PRODUCT_EXPERIENCE_STATE, { type: "open-detail", customerId: "one", commandId: "command-one", correlationId: "correlation-one", surfaceInstanceId: "surface-one" });
    const second = reduceProductExperience(first, { type: "open-detail", customerId: "two", commandId: "command-two", correlationId: "correlation-two", surfaceInstanceId: "surface-two" });
    expect(reduceProductExperience(second, { type: "visible-ready", surfaceInstanceId: "surface-one" })).toBe(second);
    expect(reduceProductExperience(second, { type: "visible-ready", surfaceInstanceId: "surface-two" }).presentationStatus).toBe("visible-ready");
  });

  it("returns to conversation without discarding the active surface", () => {
    const opened = reduceProductExperience(INITIAL_PRODUCT_EXPERIENCE_STATE, { type: "open-detail", customerId: "customer-1", commandId: "command-1", correlationId: "correlation-1", surfaceInstanceId: "surface-1" });
    const returned = reduceProductExperience(opened, { type: "return" });
    expect(returned).toMatchObject({ mode: "conversation", activeSurface: "customer.detail", activeEntityId: "customer-1" });
    expect(reduceProductExperience(returned, { type: "reopen" })).toMatchObject({ mode: "surface", activeEntityId: "customer-1" });
  });

  it("projects create fields without introducing mutation intent", () => {
    expect(projectionFromCommand({ batch: [
      { type: "SET", executiveTargetId: "field.customers.create.customer.displayName", value: "Experience Runtime Test" },
      { type: "SET", executiveTargetId: "field.customers.create.customer.phone", value: "0555 111 22 33" },
    ] })).toEqual({ displayName: "Experience Runtime Test", phone: "0555 111 22 33" });
  });
});
