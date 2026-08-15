import { describe, expect, it } from "vitest";
import { revalidateCompanyUnitFormCommandResolution, validateCompanyUnitFormCommandResolution } from "../company-unit-form-command-contract";

describe("company unit form command contract", () => {
  it("accepts set_field for all known fields", () => {
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "set_field", field: "name", value: "Genel Merkez" })?.kind).toBe("executable");
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "set_field", field: "unitType", value: "HEADQUARTERS" })?.kind).toBe("executable");
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "set_field", field: "city", value: "İstanbul" })?.kind).toBe("executable");
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "set_field", field: "addressLine1", value: "Örnek Cad." })?.kind).toBe("executable");
  });

  it("accepts commit, discard, and load_unit", () => {
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "commit" })?.kind).toBe("executable");
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "discard" })?.kind).toBe("executable");
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "load_unit", unitId: "unit-123" })?.kind).toBe("executable");
  });

  it("rejects unknown fields and empty values", () => {
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "set_field", field: "unknown", value: "x" })).toBeNull();
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "set_field", field: "name", value: "" })).toBeNull();
    expect(validateCompanyUnitFormCommandResolution({ result: "executable", action: "load_unit", unitId: "" })).toBeNull();
  });

  it("handles unsupported and clarification results", () => {
    expect(validateCompanyUnitFormCommandResolution({ result: "unsupported" })?.kind).toBe("unsupported");
    expect(validateCompanyUnitFormCommandResolution({ result: "clarification_required", message: "Birim adı nedir?" })?.kind).toBe("clarification_required");
    expect(validateCompanyUnitFormCommandResolution({ result: "clarification_required", message: "" })).toBeNull();
  });

  it("revalidates wire commands", () => {
    expect(revalidateCompanyUnitFormCommandResolution({ kind: "executable", command: { type: "set_field", field: "city", value: "Ankara" } })?.kind).toBe("executable");
    expect(revalidateCompanyUnitFormCommandResolution({ kind: "executable", command: { type: "load_unit", unitId: "u1" } })?.kind).toBe("executable");
    expect(revalidateCompanyUnitFormCommandResolution({ kind: "executable", command: { type: "set_field", field: "unknown", value: "x" } })).toBeNull();
    expect(revalidateCompanyUnitFormCommandResolution({ kind: "unsupported" })?.kind).toBe("unsupported");
  });
});
