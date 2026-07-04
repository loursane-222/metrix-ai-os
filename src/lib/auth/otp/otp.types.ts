import type { OtpChallenge } from "@prisma/client";

export type OtpChallengeResult = OtpChallenge;

export type CreateOtpChallengeInput = {
  phone: string;
  codeHash: string;
  purpose: string;
  expiresAt: Date;
  maxAttempts: number;
};

export type RequestOtpInput = {
  phone: string;
  rememberMe?: boolean;
};

export type RequestOtpResult = {
  phone: string;
  challengeId: string;
  expiresAt: Date;
  provider: string;
  devOtpCode?: string;
};

export type VerifyOtpInput = {
  phone: string;
  code: string;
  rememberMe?: boolean;
  userAgent?: string | null;
};
