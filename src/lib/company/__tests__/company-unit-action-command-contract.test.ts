import { describe, expect, it } from "vitest";
import { revalidateCompanyUnitActionCommandResolution, validateCompanyUnitActionCommandResolution } from "../company-unit-action-command-contract";

describe("company unit action command contract", () => {
  it("accepts make_primary and deactivate with valid unitId", () => {
    expect(validateCompanyUnitActionCommandResolution({ result: "executable", action: "make_primary", unitId: "unit-abc" })?.kind).toBe("executable");
    expect(validateCompanyUnitActionCommandResolution({ result: "executable", action: "deactivate", unitId: "unit-xyz" })?.kind).toBe("executable");
  });

  it("rejects unknown actions", () => {
    expect(validateCompanyUnitActionCommandResolution({ result: "executable", action: "delete", unitId: "unit-abc" })).toBeNull();
    expect(validateCompanyUnitActionCommandResolution({ result: "executable", action: "make_primary", unitId: "" })).toBeNull();
    expect(validateCompanyUnitActionCommandResolution({ result: "executable", action: "make_primary" })).toBeNull();
  });

  it("handles unsupported and clarification results", () => {
    expect(validateCompanyUnitActionCommandResolution({ result: "unsupported" })?.kind).toBe("unsupported");
    expect(validateCompanyUnitActionCommandResolution({ result: "clarification_required", message: "Hangi birim?" })?.kind).toBe("clarification_required");
    expect(validateCompanyUnitActionCommandResolution({ result: "clarification_required", message: "" })).toBeNull();
  });

  it("revalidates wire commands", () => {
    expect(revalidateCompanyUnitActionCommandResolution({ kind: "executable", command: { type: "make_primary", unitId: "u1" } })?.kind).toBe("executable");
    expect(revalidateCompanyUnitActionCommandResolution({ kind: "executable", command: { type: "deactivate", unitId: "u2" } })?.kind).toBe("executable");
    expect(revalidateCompanyUnitActionCommandResolution({ kind: "unsupported" })?.kind).toBe("unsupported");
    expect(revalidateCompanyUnitActionCommandResolution({ kind: "executable", command: { type: "unknown", unitId: "u1" } })).toBeNull();
  });
});
