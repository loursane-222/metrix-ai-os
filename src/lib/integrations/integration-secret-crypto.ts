import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Same AES-256-GCM recipe as gmail-oauth.service.ts's encryptToken/decryptToken,
// kept as a separate copy (not shared) so this vendor-agnostic integration
// layer never risks a change here regressing the existing Gmail integration.
// One key for all non-OAuth integration connections (IntegrationConnection),
// not one per vendor — a new accounting connector never needs a new secret.
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function encryptIntegrationSecret(plaintext: string): string {
  const key = Buffer.from(requiredEnv("INTEGRATION_SECRET_ENCRYPTION_KEY"), "hex");
  if (key.length !== 32) throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEY must be 32 bytes hex encoded.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptIntegrationSecret(value: string): string {
  const key = Buffer.from(requiredEnv("INTEGRATION_SECRET_ENCRYPTION_KEY"), "hex");
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (key.length !== 32 || !iv || !tag || !encrypted) throw new Error("Stored integration secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
