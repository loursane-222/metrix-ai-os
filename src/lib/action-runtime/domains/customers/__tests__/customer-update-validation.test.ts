import { describe, expect, it } from "vitest";

import { validateCustomerUpdatePatch, buildCustomerUpdateRuntimeRiskContext } from "../customer-update.types";

describe("validateCustomerUpdatePatch", () => {
  it("accepts a valid patch with allowed fields", () => {
    expect(validateCustomerUpdatePatch({ displayName: "Acme Ltd", phone: "+905551112233" })).toEqual([]);
  });

  it("rejects an empty patch", () => {
    expect(validateCustomerUpdatePatch({})).toEqual(["patch must not be empty."]);
  });

  it("rejects an unknown field", () => {
    expect(validateCustomerUpdatePatch({ nickname: "Ace" })).toEqual(["patch.nickname is not an allowed field."]);
  });

  it.each(["id", "organizationId", "createdAt", "updatedAt", "source", "createdByUserId", "updatedByUserId"])(
    "rejects the system/tenant field %s",
    (field) => {
      const errors = validateCustomerUpdatePatch({ [field]: "value" });
      expect(errors).toEqual([`patch.${field} is not an allowed field.`]);
    },
  );

  it.each(["contacts", "quotes", "payments", "collectionActions"])(
    "rejects the relation/collection field %s belonging to another entity",
    (field) => {
      const errors = validateCustomerUpdatePatch({ [field]: [] });
      expect(errors).toEqual([`patch.${field} is not an allowed field.`]);
    },
  );

  it("rejects balanceCents/currency as they are not exposed for generic update", () => {
    expect(validateCustomerUpdatePatch({ balanceCents: 100 })).toEqual([
      "patch.balanceCents is not an allowed field.",
    ]);
    expect(validateCustomerUpdatePatch({ currency: "USD" })).toEqual([]);
  });

  it("rejects a wrong type for a string field", () => {
    expect(validateCustomerUpdatePatch({ displayName: 123 })).toEqual(["patch.displayName must be a string."]);
  });

  it("rejects a wrong type for healthScore", () => {
    expect(validateCustomerUpdatePatch({ healthScore: "80" })).toEqual(["patch.healthScore must be a number."]);
  });

  it("rejects a wrong type for boolean fields", () => {
    expect(validateCustomerUpdatePatch({ eInvoiceEnabled: "yes" })).toEqual([
      "patch.eInvoiceEnabled must be a boolean.",
    ]);
  });

  it("keeps status behind the archive lifecycle action", () => {
    expect(validateCustomerUpdatePatch({ status: "DELETED" })).toEqual([
      "patch.status is not an allowed field.",
    ]);
  });

  it("rejects a non-object billingAddress/shippingAddress", () => {
    expect(validateCustomerUpdatePatch({ billingAddress: "not-an-object" })).toEqual([
      "patch.billingAddress must be an object.",
    ]);
  });

  it("accepts a valid billingAddress object", () => {
    expect(validateCustomerUpdatePatch({ billingAddress: { city: "Istanbul" } })).toEqual([]);
  });
});

describe("buildCustomerUpdateRuntimeRiskContext", () => {
  it("produces a generic risk context reflecting only changed field names", () => {
    const context = buildCustomerUpdateRuntimeRiskContext({ displayName: "Acme", phone: "555" });

    expect(context).toEqual({
      changedFields: ["displayName", "phone"],
      externalSideEffect: false,
      reversibilityClass: "CORRECTABLE",
    });
  });
});
