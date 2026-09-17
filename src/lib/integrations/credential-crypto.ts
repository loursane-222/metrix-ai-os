import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export class MissingEncryptionKeyError extends Error {
  readonly code = "MISSING_ENCRYPTION_KEY";

  constructor() {
    super(
      "INTEGRATION_SECRET_ENCRYPTION_KEY is not configured"
    );
    this.name = "MissingEncryptionKeyError";
  }
}

function loadKey(): Buffer {
  const hex = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

  if (!hex || hex.trim().length === 0) {
    throw new MissingEncryptionKeyError();
  }

  const key = Buffer.from(hex.trim(), "hex");

  if (key.length !== 32) {
    throw new MissingEncryptionKeyError();
  }

  return key;
}

/** AES-256-GCM: iv + authTag + ciphertext, base64-joined with ":" separators. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

export class InvalidEncryptedSecretError extends Error {
  readonly code = "INVALID_ENCRYPTED_SECRET";

  constructor() {
    super("Encrypted secret is malformed or was tampered with");
    this.name = "InvalidEncryptedSecretError";
  }
}

export function decryptSecret(encoded: string): string {
  const key = loadKey();
  const parts = encoded.split(":");

  if (parts.length !== 3) {
    throw new InvalidEncryptedSecretError();
  }

  const [ivPart, authTagPart, ciphertextPart] = parts;

  try {
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new InvalidEncryptedSecretError();
  }
}
