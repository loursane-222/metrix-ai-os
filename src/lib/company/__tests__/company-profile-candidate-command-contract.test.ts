import { describe, expect, it } from "vitest";
import { revalidateCompanyProfileCandidateCommandResolution, validateCompanyProfileCandidateCommandResolution } from "../company-profile-candidate-command-contract";

describe("company profile candidate command contract", () => {
  it("accepts candidate field set commands", () => {
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "set_field", field: "taxNumber", value: "1234567890" })?.kind).toBe("executable");
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "set_field", field: "baseCurrency", value: "USD" })?.kind).toBe("executable");
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "commit" })?.kind).toBe("executable");
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "discard" })?.kind).toBe("executable");
  });

  it("accepts clear_field for all candidate fields", () => {
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "clear_field", field: "taxOffice" })?.kind).toBe("executable");
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "clear_field", field: "discountPolicy" })?.kind).toBe("executable");
  });

  it("rejects profile-only fields and empty values", () => {
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "set_field", field: "brandName", value: "Acme" })).toBeNull();
    expect(validateCompanyProfileCandidateCommandResolution({ result: "executable", action: "set_field", field: "taxNumber", value: "" })).toBeNull();
  });

  it("handles unsupported and clarification results", () => {
    expect(validateCompanyProfileCandidateCommandResolution({ result: "unsupported" })?.kind).toBe("unsupported");
    expect(validateCompanyProfileCandidateCommandResolution({ result: "clarification_required", message: "Vergi numaranızı öğrenebilir miyim?" })?.kind).toBe("clarification_required");
  });

  it("revalidates wire commands", () => {
    expect(revalidateCompanyProfileCandidateCommandResolution({ kind: "executable", command: { type: "revert_field", field: "kepAddress" } })?.kind).toBe("executable");
    expect(revalidateCompanyProfileCandidateCommandResolution({ kind: "executable", command: { type: "set_field", field: "brandName", value: "X" } })).toBeNull();
  });
});
