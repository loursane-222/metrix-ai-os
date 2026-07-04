import { TRUSTED_DEVICE_DAYS } from "@/lib/auth/shared/auth.constants";
import {
  generateSecureToken,
  hashOptionalSecret,
  hashSecret,
} from "@/lib/auth/shared/crypto";
import { addDays } from "@/lib/auth/shared/date";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

import {
  createTrustedDeviceRecord,
  findTrustedDeviceByTokenHash,
  revokeTrustedDeviceByTokenHash,
  touchTrustedDeviceRecord,
} from "./trusted-device.repository";

import type { CreatedTrustedDevice } from "./trusted-device.types";

export async function createTrustedDevice(
  userId: string,
  userAgent: string | null | undefined,
  tx?: PrismaTransactionClient,
): Promise<CreatedTrustedDevice> {
  const token = generateSecureToken();
  const trustedDevice = await createTrustedDeviceRecord(
    {
      userId,
      deviceTokenHash: hashSecret(token),
      userAgentHash: hashOptionalSecret(userAgent ?? null),
      expiresAt: addDays(new Date(), TRUSTED_DEVICE_DAYS),
    },
    tx,
  );

  return {
    trustedDevice,
    token,
  };
}

export async function validateTrustedDeviceToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) {
    return false;
  }

  const trustedDevice = await findTrustedDeviceByTokenHash(hashSecret(token));

  if (
    !trustedDevice ||
    trustedDevice.revokedAt ||
    trustedDevice.expiresAt <= new Date()
  ) {
    return false;
  }

  await touchTrustedDeviceRecord(trustedDevice.id);

  return true;
}

export async function revokeTrustedDeviceToken(
  token: string | undefined,
): Promise<void> {
  if (!token) {
    return;
  }

  await revokeTrustedDeviceByTokenHash(hashSecret(token));
}
