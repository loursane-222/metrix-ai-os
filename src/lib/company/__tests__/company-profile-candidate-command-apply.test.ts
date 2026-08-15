import { describe, expect, it, vi } from "vitest";
import { applyCompanyProfileCandidateCommand, type CompanyProfileCandidateSurfaceRuntimeAdapter } from "../company-profile-candidate-command-apply";

function makeRuntime(): CompanyProfileCandidateSurfaceRuntimeAdapter {
  const state = {
    activeTab: "Resmî Bilgiler",
    profile: { taxNumber: "1234567890", taxOffice: "Kadıköy" } as Record<string, unknown>,
    draft: { taxNumber: "1234567890", taxOffice: "Kadıköy" } as Record<string, string>,
  };
  return {
    getState: () => state,
    setField: vi.fn((field, value) => { state.draft[field] = value; }),
    commit: vi.fn(async () => ({ ok: true })),
    discard: vi.fn(),
  };
}

describe("applyCompanyProfileCandidateCommand", () => {
  it("sets a field", async () => {
    const r = makeRuntime();
    const result = await applyCompanyProfileCandidateCommand({ type: "set_field", field: "taxNumber", value: "9999999999" }, r);
    expect(result).toMatchObject({ status: "EXECUTED", appliedField: "taxNumber", appliedValue: "9999999999" });
  });

  it("clears a field", async () => {
    const r = makeRuntime();
    await applyCompanyProfileCandidateCommand({ type: "clear_field", field: "taxOffice" }, r);
    expect(r.getState().draft.taxOffice).toBe("");
  });

  it("reverts a field using profile values", async () => {
    const r = makeRuntime();
    r.getState().draft.taxNumber = "0000000000";
    const result = await applyCompanyProfileCandidateCommand({ type: "revert_field", field: "taxNumber" }, r);
    expect(result).toMatchObject({ status: "EXECUTED", appliedValue: "1234567890" });
  });

  it("commit returns PENDING_APPROVAL outcome", async () => {
    const r = makeRuntime();
    const result = await applyCompanyProfileCandidateCommand({ type: "commit" }, r);
    expect(result).toMatchObject({ status: "EXECUTED", commitOutcome: "PENDING_APPROVAL" });
  });

  it("commit propagates failure", async () => {
    const r = makeRuntime();
    vi.mocked(r.commit).mockResolvedValueOnce({ ok: false, error: "Candidate creation failed" });
    const result = await applyCompanyProfileCandidateCommand({ type: "commit" }, r);
    expect(result).toMatchObject({ status: "EXECUTION_FAILED", error: "Candidate creation failed" });
  });

  it("discard calls runtime discard", async () => {
    const r = makeRuntime();
    await applyCompanyProfileCandidateCommand({ type: "discard" }, r);
    expect(r.discard).toHaveBeenCalled();
  });
});
