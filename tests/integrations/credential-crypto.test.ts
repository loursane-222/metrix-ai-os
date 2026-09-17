import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InvalidEncryptedSecretError,
  MissingEncryptionKeyError,
  decryptSecret,
  encryptSecret
} from "../../src/lib/integrations/credential-crypto";

const ORIGINAL_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY =
    randomBytes(32).toString("hex");
});

afterEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("integration credential encryption", () => {
  it("round-trips a secret exactly", () => {
    const secret = JSON.stringify({ token: "abc123", firmId: "f1" });
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toContain("abc123");
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("throws MissingEncryptionKeyError when the key is unset", () => {
    delete process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

    expect(() => encryptSecret("x")).toThrow(MissingEncryptionKeyError);
  });

  it("throws InvalidEncryptedSecretError on tampered ciphertext", () => {
    const encrypted = encryptSecret("hello");
    const tampered = encrypted.replace(/.$/, (c) => (c === "A" ? "B" : "A"));

    expect(() => decryptSecret(tampered)).toThrow(
      InvalidEncryptedSecretError
    );
  });

  it("throws InvalidEncryptedSecretError on malformed input", () => {
    expect(() => decryptSecret("not-encrypted")).toThrow(
      InvalidEncryptedSecretError
    );
  });
});
