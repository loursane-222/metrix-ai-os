import {
  OTP_EXPIRES_IN_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_WINDOW_SECONDS,
} from "@/lib/auth/shared/auth.constants";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { generateOtpCode, hashSecret, verifySecret } from "@/lib/auth/shared/crypto";
import { addMinutes, addSeconds } from "@/lib/auth/shared/date";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { sendOtpEmail } from "./email.service";

import {
  consumeOtpChallenge,
  createOtpChallengeRecord,
  findLatestOtpChallengeByPhone,
  findRecentOtpChallengeByPhone,
  incrementOtpChallengeAttempts,
} from "./otp.repository";

import type {
  RequestOtpInput,
  RequestOtpResult,
  VerifyOtpInput,
} from "./otp.types";

const OTP_PURPOSE_LOGIN = "LOGIN";

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AuthError("Email is required.", 400);
  }
  return email;
}

export async function requestOtp(
  input: RequestOtpInput,
): Promise<RequestOtpResult> {
  const phone = normalizeEmail(input.phone);
  const now = new Date();
  const recentThreshold = addSeconds(now, -OTP_RESEND_WINDOW_SECONDS);
  const recentChallenge = await findRecentOtpChallengeByPhone(
    phone,
    recentThreshold,
  );

  if (recentChallenge) {
    throw new AuthError("Please wait before requesting another OTP.", 429);
  }

  const code = generateOtpCode();
  const challenge = await createOtpChallengeRecord({
    phone,
    codeHash: hashSecret(code),
    purpose: OTP_PURPOSE_LOGIN,
    expiresAt: addMinutes(now, OTP_EXPIRES_IN_MINUTES),
    maxAttempts: OTP_MAX_ATTEMPTS,
  });

  let provider: string;
  let devOtpCode: string | undefined;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Email OTP for ${phone}: ${code}`);
    provider = "mock";
    devOtpCode = code;
  } else {
    try {
      await sendOtpEmail(phone, code);
      provider = "resend";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Email gönderilemedi.";
      throw new AuthError(message, 500);
    }
  }

  return {
    phone,
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    provider,
    devOtpCode,
  };
}

export async function verifyOtpChallenge(
  input: VerifyOtpInput,
  tx?: PrismaTransactionClient,
): Promise<{ phone: string }> {
  const phone = normalizeEmail(input.phone);
  const challenge = await findLatestOtpChallengeByPhone(phone, tx);
  const now = new Date();

  if (!challenge) {
    throw new AuthError("OTP challenge was not found.", 400);
  }

  if (challenge.consumedAt) {
    throw new AuthError("OTP challenge was already used.", 400);
  }

  if (challenge.expiresAt <= now) {
    throw new AuthError("OTP challenge expired.", 400);
  }

  if (challenge.attemptCount >= challenge.maxAttempts) {
    throw new AuthError("OTP challenge attempt limit exceeded.", 429);
  }

  if (!verifySecret(input.code, challenge.codeHash)) {
    await incrementOtpChallengeAttempts(challenge.id, tx);
    throw new AuthError("OTP code is invalid.", 400);
  }

  await consumeOtpChallenge(challenge.id, tx);

  return {
    phone,
  };
}
