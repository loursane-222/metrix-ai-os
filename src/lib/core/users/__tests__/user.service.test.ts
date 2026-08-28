import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateUserProfileRecord } = vi.hoisted(() => ({
  updateUserProfileRecord: vi.fn(),
}));

vi.mock("../user.repository", () => ({
  createUserRecord: vi.fn(),
  findUserRecordById: vi.fn(),
  findUserRecordByPhone: vi.fn(),
  updateUserProfileRecord,
}));

import { UpdateUserProfileValidationError, updateUserProfile } from "../user.service";

describe("updateUserProfile", () => {
  beforeEach(() => {
    updateUserProfileRecord.mockReset();
  });

  it("trims and forwards a valid patch to the repository", async () => {
    updateUserProfileRecord.mockResolvedValueOnce({ id: "user-1" });

    await updateUserProfile("user-1", {
      fullName: "  Ahmet Ateş  ",
      email: " ahmet@example.com ",
      timezone: " Europe/Istanbul ",
    });

    expect(updateUserProfileRecord).toHaveBeenCalledWith("user-1", {
      fullName: "Ahmet Ateş",
      email: "ahmet@example.com",
      timezone: "Europe/Istanbul",
    });
  });

  it("allows a partial patch", async () => {
    updateUserProfileRecord.mockResolvedValueOnce({ id: "user-1" });

    await updateUserProfile("user-1", { fullName: "Ahmet Ateş" });

    expect(updateUserProfileRecord).toHaveBeenCalledWith("user-1", {
      fullName: "Ahmet Ateş",
    });
  });

  it("rejects an invalid email", async () => {
    await expect(
      updateUserProfile("user-1", { email: "not-an-email" }),
    ).rejects.toBeInstanceOf(UpdateUserProfileValidationError);
    expect(updateUserProfileRecord).not.toHaveBeenCalled();
  });

  it("rejects an empty fullName", async () => {
    await expect(
      updateUserProfile("user-1", { fullName: "   " }),
    ).rejects.toBeInstanceOf(UpdateUserProfileValidationError);
    expect(updateUserProfileRecord).not.toHaveBeenCalled();
  });

  it("rejects an empty timezone", async () => {
    await expect(
      updateUserProfile("user-1", { timezone: "" }),
    ).rejects.toBeInstanceOf(UpdateUserProfileValidationError);
    expect(updateUserProfileRecord).not.toHaveBeenCalled();
  });

  it("forwards a valid voicePreference to the repository", async () => {
    updateUserProfileRecord.mockResolvedValueOnce({ id: "user-1" });

    await updateUserProfile("user-1", { voicePreference: "executive_female" });

    expect(updateUserProfileRecord).toHaveBeenCalledWith("user-1", {
      voicePreference: "executive_female",
    });
  });

  it("rejects a voicePreference outside the supported set", async () => {
    await expect(
      updateUserProfile("user-1", { voicePreference: "robotic" }),
    ).rejects.toBeInstanceOf(UpdateUserProfileValidationError);
    expect(updateUserProfileRecord).not.toHaveBeenCalled();
  });
});
