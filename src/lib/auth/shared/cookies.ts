import {
  REMEMBER_ME_SESSION_DAYS,
  SHORT_SESSION_HOURS,
  TRUSTED_DEVICE_DAYS,
} from "./auth.constants";

export type AuthCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_HOUR = 60 * 60;

export function buildSessionCookieOptions(
  rememberMe: boolean,
): AuthCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: rememberMe
      ? REMEMBER_ME_SESSION_DAYS * SECONDS_PER_DAY
      : SHORT_SESSION_HOURS * SECONDS_PER_HOUR,
  };
}

export function buildTrustedDeviceCookieOptions(): AuthCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TRUSTED_DEVICE_DAYS * SECONDS_PER_DAY,
  };
}

export function buildClearCookieOptions(): AuthCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}
