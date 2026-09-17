import { z } from "zod";

import { db } from "../db";
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiryFromNow,
  shouldEchoOtpForDev
} from "../auth/otp";
import { issueSession } from "../auth/session-issuance";

const RequestOtpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  rememberMe: z.boolean().default(true)
});

export type RequestOtpInput = z.input<typeof RequestOtpInputSchema>;

export type RequestOtpResult = {
  ok: true;
  devOtpCode?: string;
};

export async function requestLoginOtp(
  rawInput: RequestOtpInput
): Promise<RequestOtpResult> {
  const input = RequestOtpInputSchema.parse(rawInput);

  const code = generateOtpCode();

  await db.loginChallenge.create({
    data: {
      email: input.email,
      codeHash: hashOtpCode(code),
      rememberMe: input.rememberMe,
      expiresAt: otpExpiryFromNow()
    }
  });

  return {
    ok: true,
    ...(shouldEchoOtpForDev() ? { devOtpCode: code } : {})
  };
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

  const user = await db.user.upsert({
    where: { email: input.email },
    create: { email: input.email },
    update: {}
  });

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
