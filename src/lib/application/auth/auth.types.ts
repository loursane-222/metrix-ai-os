import type { Session, TrustedDevice, User } from "@prisma/client";

export type AuthRequestOtpInput = {
  phone: string;
  rememberMe?: boolean;
};

export type AuthRequestOtpResult = {
  phone: string;
  challengeId: string;
  expiresAt: Date;
  provider: string;
  devOtpCode?: string;
};

export type AuthVerifyOtpInput = {
  phone: string;
  code: string;
  rememberMe?: boolean;
  userAgent?: string | null;
};

export type AuthVerifyOtpResult = {
  user: User;
  session: Session;
  trustedDevice?: TrustedDevice;
  sessionToken: string;
  trustedDeviceToken?: string;
  rememberMe: boolean;
  sessionExpiresAt: Date;
};

export type CurrentAuthContext = {
  user: User;
  session: Session;
  trustedDeviceValid: boolean;
};

export type AuthLogoutInput = {
  sessionToken?: string;
  trustedDeviceToken?: string;
};
