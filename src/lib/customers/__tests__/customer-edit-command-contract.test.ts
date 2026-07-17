import { describe, expect, it } from "vitest";

import {
  customerEditCommandFieldPathToString,
  parseCustomerEditCommandFieldPath,
  revalidateCustomerEditCommandResolution,
  validateCustomerEditCommandResolution,
} from "../customer-edit-command-contract";

describe("parseCustomerEditCommandFieldPath", () => {
  it("parses an allowlisted top-level field", () => {
    expect(parseCustomerEditCommandFieldPath("phone")).toEqual({ kind: "top", field: "phone" });
  });

  it("parses an allowlisted nested address field", () => {
    expect(parseCustomerEditCommandFieldPath("billingAddress.city")).toEqual({
      kind: "address",
      addressKind: "billingAddress",
      property: "city",
    });
  });

  it("rejects an unknown top-level field", () => {
    expect(parseCustomerEditCommandFieldPath("organizationId")).toBeNull();
  });

  it("rejects an unknown address kind", () => {
    expect(parseCustomerEditCommandFieldPath("secondaryAddress.city")).toBeNull();
  });

  it("rejects an unknown address property", () => {
    expect(parseCustomerEditCommandFieldPath("billingAddress.line2")).toBeNull();
  });

  it("rejects a field that is not a whole allowlisted top-level entry (address objects are not directly settable)", () => {
    expect(parseCustomerEditCommandFieldPath("billingAddress")).toBeNull();
  });

  it("rejects malformed dotted paths", () => {
    expect(parseCustomerEditCommandFieldPath("billingAddress.city.extra")).toBeNull();
    expect(parseCustomerEditCommandFieldPath("")).toBeNull();
  });
});

describe("customerEditCommandFieldPathToString", () => {
  it("formats a top field", () => {
    expect(customerEditCommandFieldPathToString({ kind: "top", field: "phone" })).toBe("phone");
  });

  it("formats an address field", () => {
    expect(
      customerEditCommandFieldPathToString({ kind: "address", addressKind: "billingAddress", property: "city" }),
    ).toBe("billingAddress.city");
  });
});

describe("validateCustomerEditCommandResolution — structured resolver output validation", () => {
  it("accepts a valid set_field command for a string field", () => {
    const result = validateCustomerEditCommandResolution({
      result: "executable",
      action: "set_field",
      field: "phone",
      value: "0532 111 22 33",
    });
    expect(result).toEqual({
      kind: "executable",
      command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "0532 111 22 33" },
    });
  });

  it("accepts a valid set_field command for a nested address field", () => {
    const result = validateCustomerEditCommandResolution({
      result: "executable",
      action: "set_field",
      field: "billingAddress.city",
      value: "Ankara",
    });
    expect(result).toEqual({
      kind: "executable",
      command: {
        type: "set_field",
        field: { kind: "address", addressKind: "billingAddress", property: "city" },
        value: "Ankara",
      },
    });
  });

  it("accepts a valid boolean set_field command", () => {
    const result = validateCustomerEditCommandResolution({
      result: "executable",
      action: "set_field",
      field: "eInvoiceEnabled",
      value: true,
    });
    expect(result?.kind).toBe("executable");
  });

  it("rejects a boolean field given a string value", () => {
    expect(
      validateCustomerEditCommandResolution({
        result: "executable",
        action: "set_field",
        field: "eInvoiceEnabled",
        value: "true",
      }),
    ).toBeNull();
  });

  it("rejects a status value outside the enum", () => {
    expect(
      validateCustomerEditCommandResolution({
        result: "executable",
        action: "set_field",
        field: "status",
        value: "VIP",
      }),
    ).toBeNull();
  });

  it("accepts a valid select_tab command", () => {
    expect(
      validateCustomerEditCommandResolution({ result: "executable", action: "select_tab", tabId: "address" }),
    ).toEqual({ kind: "executable", command: { type: "select_tab", tabId: "address" } });
  });

  it("rejects an allowlist-outside tab id", () => {
    expect(
      validateCustomerEditCommandResolution({ result: "executable", action: "select_tab", tabId: "billing" }),
    ).toBeNull();
  });

  it("accepts commit and discard with no payload", () => {
    expect(validateCustomerEditCommandResolution({ result: "executable", action: "commit" })).toEqual({
      kind: "executable",
      command: { type: "commit" },
    });
    expect(validateCustomerEditCommandResolution({ result: "executable", action: "discard" })).toEqual({
      kind: "executable",
      command: { type: "discard" },
    });
  });

  it("rejects an allowlist-outside action name", () => {
    expect(validateCustomerEditCommandResolution({ result: "executable", action: "delete_customer" })).toBeNull();
  });

  it("accepts unsupported", () => {
    expect(validateCustomerEditCommandResolution({ result: "unsupported" })).toEqual({ kind: "unsupported" });
  });

  it("accepts clarification_required with a message", () => {
    expect(
      validateCustomerEditCommandResolution({ result: "clarification_required", message: "Hangi alani?" }),
    ).toEqual({ kind: "clarification_required", message: "Hangi alani?" });
  });

  it("rejects clarification_required without a message", () => {
    expect(validateCustomerEditCommandResolution({ result: "clarification_required" })).toBeNull();
  });

  it("rejects an unknown top-level result", () => {
    expect(validateCustomerEditCommandResolution({ result: "maybe" })).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(validateCustomerEditCommandResolution("executable")).toBeNull();
    expect(validateCustomerEditCommandResolution(null)).toBeNull();
    expect(validateCustomerEditCommandResolution([1, 2, 3])).toBeNull();
  });

  it("rejects a set_field with a disallowed field even inside an otherwise well-formed payload (prompt-injection-shaped input)", () => {
    expect(
      validateCustomerEditCommandResolution({
        result: "executable",
        action: "set_field",
        field: "organizationId",
        value: "org_HACKED",
      }),
    ).toBeNull();
  });
});

describe("revalidateCustomerEditCommandResolution — client-boundary re-validation of the already-typed wire shape", () => {
  it("accepts a resolution shape that already matches CustomerEditCommandResolution", () => {
    const result = revalidateCustomerEditCommandResolution({
      kind: "executable",
      command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "222" },
    });
    expect(result).toEqual({
      kind: "executable",
      command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "222" },
    });
  });

  it("accepts a nested address field path object", () => {
    const result = revalidateCustomerEditCommandResolution({
      kind: "executable",
      command: {
        type: "set_field",
        field: { kind: "address", addressKind: "billingAddress", property: "city" },
        value: "Ankara",
      },
    });
    expect(result?.kind).toBe("executable");
  });

  it("rejects an unknown command type even though the outer shape is well-formed", () => {
    expect(
      revalidateCustomerEditCommandResolution({ kind: "executable", command: { type: "not_a_real_command" } }),
    ).toBeNull();
  });

  it("rejects a field path object with a disallowed field name", () => {
    expect(
      revalidateCustomerEditCommandResolution({
        kind: "executable",
        command: { type: "set_field", field: { kind: "top", field: "organizationId" }, value: "org_HACKED" },
      }),
    ).toBeNull();
  });

  it("passes through unsupported and clarification_required", () => {
    expect(revalidateCustomerEditCommandResolution({ kind: "unsupported" })).toEqual({ kind: "unsupported" });
    expect(revalidateCustomerEditCommandResolution({ kind: "clarification_required", message: "Hangi alan?" })).toEqual({
      kind: "clarification_required",
      message: "Hangi alan?",
    });
  });
});
