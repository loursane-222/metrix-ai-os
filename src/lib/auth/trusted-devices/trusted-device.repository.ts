import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

import type { TrustedDeviceResult } from "./trusted-device.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createTrustedDeviceRecord(
  input: {
    userId: string;
    deviceTokenHash: string;
    userAgentHash: string | null;
    expiresAt: Date;
  },
  tx?: PrismaTransactionClient,
): Promise<TrustedDeviceResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.trustedDevice.create({
    data: input,
  });
}

export async function findTrustedDeviceByTokenHash(
  deviceTokenHash: string,
  tx?: PrismaTransactionClient,
): Promise<TrustedDeviceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.trustedDevice.findUnique({
    where: {
      deviceTokenHash,
    },
  });
}

export async function touchTrustedDeviceRecord(
  id: string,
  tx?: PrismaTransactionClient,
): Promise<TrustedDeviceResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.trustedDevice.update({
    where: {
      id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });
}

export async function revokeTrustedDeviceByTokenHash(
  deviceTokenHash: string,
  tx?: PrismaTransactionClient,
): Promise<TrustedDeviceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const trustedDevice = await client.trustedDevice.findUnique({
    where: {
      deviceTokenHash,
    },
  });

  if (!trustedDevice) {
    return null;
  }

  return client.trustedDevice.update({
    where: {
      id: trustedDevice.id,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
