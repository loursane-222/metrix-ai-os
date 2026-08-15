import { describe, expect, it } from "vitest";
import { revalidateCompanyProfileEditCommandResolution, validateCompanyProfileEditCommandResolution } from "../company-profile-edit-command-contract";

describe("company profile edit command contract", () => {
  it("accepts profile field set commands", () => {
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "set_field", field: "brandName", value: "Acme" })?.kind).toBe("executable");
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "set_field", field: "activityAreasJson", value: "Retail,B2B" })?.kind).toBe("executable");
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "commit" })?.kind).toBe("executable");
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "discard" })?.kind).toBe("executable");
  });

  it("accepts clear_field for clearable fields only", () => {
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "clear_field", field: "website" })?.kind).toBe("executable");
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "clear_field", field: "description" })?.kind).toBe("executable");
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "clear_field", field: "brandName" })).toBeNull();
  });

  it("rejects unknown fields and empty values", () => {
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "set_field", field: "taxNumber", value: "123" })).toBeNull();
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "set_field", field: "brandName", value: "" })).toBeNull();
    expect(validateCompanyProfileEditCommandResolution({ result: "executable", action: "set_field", field: "unknown", value: "x" })).toBeNull();
  });

  it("handles unsupported and clarification results", () => {
    expect(validateCompanyProfileEditCommandResolution({ result: "unsupported" })?.kind).toBe("unsupported");
    expect(validateCompanyProfileEditCommandResolution({ result: "clarification_required", message: "Hangi alan?" })?.kind).toBe("clarification_required");
  });

  it("revalidates wire commands", () => {
    expect(revalidateCompanyProfileEditCommandResolution({ kind: "executable", command: { type: "revert_field", field: "city" } })?.kind).toBe("executable");
    expect(revalidateCompanyProfileEditCommandResolution({ kind: "executable", command: { type: "clear_field", field: "brandName" } })).toBeNull();
  });
});
