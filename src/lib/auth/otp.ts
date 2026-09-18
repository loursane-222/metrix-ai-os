import { createHash, randomInt } from "node:crypto";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtpCode(): string {
  let code = "";

  for (let i = 0; i < OTP_LENGTH; i += 1) {
    code += randomInt(0, 10).toString();
  }

  return code;
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function otpExpiryFromNow(): Date {
  return new Date(Date.now() + OTP_TTL_MS);
}

/**
 * Dev-only affordance: in any non-production environment the generated
 * code is echoed back to the caller so the login flow is usable
 * end-to-end without needing a real inbox. In production this is off and
 * the code is delivered by email instead (see auth-login.ts). Gated on
 * NODE_ENV, which Next.js itself sets to "production" for `next build`/
 * `next start` — this branch is dead code in a real production build.
 */
export function shouldEchoOtpForDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
