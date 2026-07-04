import { createSession, requireSessionToken, revokeSessionToken } from "@/lib/auth/sessions/session.service";
import { requestOtp, verifyOtpChallenge } from "@/lib/auth/otp/otp.service";
import {
  createTrustedDevice,
  revokeTrustedDeviceToken,
  validateTrustedDeviceToken,
} from "@/lib/auth/trusted-devices/trusted-device.service";
import { findOrCreateAuthUserByPhone } from "@/lib/auth/users/auth-user.service";
import { prisma } from "@/lib/core/shared/prisma";

import type {
  AuthLogoutInput,
  AuthRequestOtpInput,
  AuthRequestOtpResult,
  AuthVerifyOtpInput,
  AuthVerifyOtpResult,
  CurrentAuthContext,
} from "./auth.types";

export async function requestAuthOtp(
  input: AuthRequestOtpInput,
): Promise<AuthRequestOtpResult> {
  return requestOtp(input);
}

export async function verifyAuthOtp(
  input: AuthVerifyOtpInput,
): Promise<AuthVerifyOtpResult> {
  const rememberMe = input.rememberMe ?? true;

  return prisma.$transaction(async (tx) => {
    const { phone } = await verifyOtpChallenge(input, tx);
    const user = await findOrCreateAuthUserByPhone(phone, tx);
    const createdSession = await createSession(user.id, rememberMe, tx);
    const createdTrustedDevice = rememberMe
      ? await createTrustedDevice(user.id, input.userAgent, tx)
      : undefined;

    return {
      user,
      session: createdSession.session,
      trustedDevice: createdTrustedDevice?.trustedDevice,
      sessionToken: createdSession.token,
      trustedDeviceToken: createdTrustedDevice?.token,
      rememberMe,
      sessionExpiresAt: createdSession.session.expiresAt,
    };
  });
}

export async function getCurrentAuthContext(
  sessionToken: string | undefined,
  trustedDeviceToken: string | undefined,
): Promise<CurrentAuthContext | null> {
  const validatedSession = await requireSessionToken(sessionToken);
  const trustedDeviceValid =
    await validateTrustedDeviceToken(trustedDeviceToken);

  return {
    user: validatedSession.user,
    session: validatedSession,
    trustedDeviceValid,
  };
}

export async function logoutAuth(input: AuthLogoutInput): Promise<void> {
  await revokeSessionToken(input.sessionToken);
  await revokeTrustedDeviceToken(input.trustedDeviceToken);
}
