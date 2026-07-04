import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(secret: string, hash: string): boolean {
  const secretHash = hashSecret(secret);
  const secretBuffer = Buffer.from(secretHash, "hex");
  const hashBuffer = Buffer.from(hash, "hex");

  if (secretBuffer.length !== hashBuffer.length) {
    return false;
  }

  return timingSafeEqual(secretBuffer, hashBuffer);
}

export function hashOptionalSecret(secret: string | null): string | null {
  if (!secret) {
    return null;
  }

  return hashSecret(secret);
}
