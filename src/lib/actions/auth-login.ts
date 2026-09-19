import { z } from "zod";

import { db } from "../db";
import {
  type EmailSender,
  sendEmailViaResend
} from "../email/resend-client";
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiryFromNow,
  shouldEchoOtpForDev
} from "../auth/otp";
import { issueSession } from "../auth/session-issuance";
import { canActivateAfterOtp } from "../platform/access-policy";

const RequestOtpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  rememberMe: z.boolean().default(true)
});

export type RequestOtpInput = z.input<typeof RequestOtpInputSchema>;

export type RequestOtpResult = {
  ok: true;
  devOtpCode?: string;
};

export type RequestLoginOtpDeps = {
  sendEmail?: EmailSender;
};

export class OtpDeliveryError extends Error {
  readonly code = "OTP_DELIVERY_FAILED";

  constructor() {
    super("Failed to deliver the login code");
    this.name = "OtpDeliveryError";
  }
}

export class OtpRateLimitedError extends Error {
  readonly code = "OTP_RATE_LIMITED";

  constructor() {
    super("Too many login code requests for this email");
    this.name = "OtpRateLimitedError";
  }
}

export class AccessNotApprovedError extends Error {
  readonly code = "ACCESS_NOT_APPROVED";
  constructor() { super("METRIX access is invitation-only"); }
}

export const OTP_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const OTP_RATE_LIMIT_MAX_REQUESTS = 3;

async function enforceOtpRateLimit(email: string): Promise<void> {
  const windowStart = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MS);

  const recentCount = await db.loginChallenge.count({
    where: { email, createdAt: { gt: windowStart } }
  });

  if (recentCount >= OTP_RATE_LIMIT_MAX_REQUESTS) {
    throw new OtpRateLimitedError();
  }
}

function otpEmailContent(code: string): { subject: string; text: string } {
  return {
    subject: "METRIX giriş kodunuz",
    text:
      `METRIX'e giriş yapmak için doğrulama kodunuz:\n\n${code}\n\n` +
      "Bu kod 10 dakika geçerlidir.\n\n" +
      "Bu talebi siz oluşturmadıysanız bu mesajı dikkate almayabilirsiniz."
  };
}

export async function requestLoginOtp(
  rawInput: RequestOtpInput,
  deps: RequestLoginOtpDeps = {}
): Promise<RequestOtpResult> {
  const sendEmail = deps.sendEmail ?? sendEmailViaResend;
  const input = RequestOtpInputSchema.parse(rawInput);

  const knownUser = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!knownUser) throw new AccessNotApprovedError();

  await enforceOtpRateLimit(input.email);

  const code = generateOtpCode();

  const challenge = await db.loginChallenge.create({
    data: {
      email: input.email,
      codeHash: hashOtpCode(code),
      rememberMe: input.rememberMe,
      expiresAt: otpExpiryFromNow()
    }
  });

  if (shouldEchoOtpForDev()) {
    return { ok: true, devOtpCode: code };
  }

  const { subject, text } = otpEmailContent(code);

  try {
    await sendEmail({ to: input.email, subject, text });
  } catch {
    await db.loginChallenge
      .delete({ where: { id: challenge.id } })
      .catch(() => {});

    throw new OtpDeliveryError();
  }

  return { ok: true };
}

const VerifyOtpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().length(6)
});

export type VerifyOtpInput = z.input<typeof VerifyOtpInputSchema>;

export class InvalidOtpError extends Error {
  readonly code = "INVALID_OTP";

  constructor() {
    super("The provided code is invalid or has expired");
    this.name = "InvalidOtpError";
  }
}

export type VerifyOtpResult = {
  ok: true;
  sessionToken: string;
  sessionExpiresAt: Date;
  userId: string;
  needsOrganization: boolean;
};

export async function verifyLoginOtp(
  rawInput: VerifyOtpInput
): Promise<VerifyOtpResult> {
  const input = VerifyOtpInputSchema.parse(rawInput);

  const now = new Date();

  const challenge = await db.loginChallenge.findFirst({
    where: {
      email: input.email,
      consumedAt: null,
      expiresAt: { gt: now }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!challenge || challenge.codeHash !== hashOtpCode(input.code)) {
    throw new InvalidOtpError();
  }

  await db.loginChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: now }
  });

  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user || !canActivateAfterOtp({ existingUser: Boolean(user), acceptedInvite: false }) || user.platformStatus !== "ACTIVE") {
    throw new AccessNotApprovedError();
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: user.id }
  });

  const session = await issueSession({
    userId: user.id,
    rememberMe: challenge.rememberMe
  });

  return {
    ok: true,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    userId: user.id,
    needsOrganization: !membership
  };
}
