import type { TrustedDevice } from "@prisma/client";

export type TrustedDeviceResult = TrustedDevice;

export type CreatedTrustedDevice = {
  trustedDevice: TrustedDeviceResult;
  token: string;
};
