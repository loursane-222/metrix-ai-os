import { describe, expect, it, vi } from "vitest";
import { applyCompanyProfileEditCommand, type CompanyProfileEditSurfaceRuntimeAdapter } from "../company-profile-edit-command-apply";

function makeRuntime(): CompanyProfileEditSurfaceRuntimeAdapter {
  const state = {
    activeTab: "Kimlik ve İletişim",
    profile: { brandName: "Acme Ltd", city: "İstanbul", activityAreasJson: ["Retail", "B2B"] } as Record<string, unknown>,
    draft: { brandName: "Acme Ltd", city: "İstanbul", activityAreasJson: "Retail, B2B" } as Record<string, string>,
  };
  return {
    getState: () => state,
    setField: vi.fn((field, value) => { state.draft[field] = value; }),
    commit: vi.fn(async () => ({ ok: true })),
    discard: vi.fn(),
  };
}

describe("applyCompanyProfileEditCommand", () => {
  it("sets a field", async () => {
    const r = makeRuntime();
    const result = await applyCompanyProfileEditCommand({ type: "set_field", field: "city", value: "Ankara" }, r);
    expect(result).toMatchObject({ status: "EXECUTED", appliedField: "city", appliedValue: "Ankara" });
    expect(r.getState().draft.city).toBe("Ankara");
  });

  it("clears a field", async () => {
    const r = makeRuntime();
    await applyCompanyProfileEditCommand({ type: "clear_field", field: "city" }, r);
    expect(r.getState().draft.city).toBe("");
  });

  it("reverts a field using profile values — joins arrays with comma", async () => {
    const r = makeRuntime();
    const result = await applyCompanyProfileEditCommand({ type: "revert_field", field: "activityAreasJson" }, r);
    expect(result).toMatchObject({ status: "EXECUTED", appliedValue: "Retail, B2B" });
  });

  it("commit returns SAVED outcome", async () => {
    const r = makeRuntime();
    const result = await applyCompanyProfileEditCommand({ type: "commit" }, r);
    expect(result).toMatchObject({ status: "EXECUTED", commitOutcome: "SAVED" });
  });

  it("commit propagates failure", async () => {
    const r = makeRuntime();
    vi.mocked(r.commit).mockResolvedValueOnce({ ok: false, error: "PATCH failed" });
    const result = await applyCompanyProfileEditCommand({ type: "commit" }, r);
    expect(result).toMatchObject({ status: "EXECUTION_FAILED", error: "PATCH failed" });
  });

  it("discard calls runtime discard", async () => {
    const r = makeRuntime();
    await applyCompanyProfileEditCommand({ type: "discard" }, r);
    expect(r.discard).toHaveBeenCalled();
  });
});
