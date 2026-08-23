import { beforeEach, describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../integration-secret-crypto";

describe("integration secret encryption", () => {
  beforeEach(() => {
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = "0".repeat(64); // 32 bytes hex
  });

  it("round-trips a secret through encrypt/decrypt", () => {
    const encrypted = encryptIntegrationSecret("super-secret-token");
    expect(encrypted).not.toContain("super-secret-token");
    expect(decryptIntegrationSecret(encrypted)).toBe("super-secret-token");
  });

  it("rejects a tampered ciphertext instead of silently returning garbage", () => {
    const encrypted = encryptIntegrationSecret("super-secret-token");
    const [iv, tag, body] = encrypted.split(".");
    const tampered = `${iv}.${tag}.${body!.slice(0, -2)}AA`;
    expect(() => decryptIntegrationSecret(tampered)).toThrow();
  });

  it("throws when the encryption key is missing", () => {
    delete process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
    expect(() => encryptIntegrationSecret("x")).toThrow("INTEGRATION_SECRET_ENCRYPTION_KEY");
  });
});
