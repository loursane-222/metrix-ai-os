import { AuthError } from "./auth.errors";

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();

  if (!trimmed) {
    throw new AuthError("Phone is required.", 400);
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 15) {
    throw new AuthError("Phone is invalid.", 400);
  }

  if (digits.startsWith("90") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith("0") && digits.length === 11) {
    return `+90${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `+90${digits}`;
  }

  return `+${digits}`;
}
