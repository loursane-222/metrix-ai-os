import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

import type { CreateOtpChallengeInput, OtpChallengeResult } from "./otp.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function findRecentOtpChallengeByPhone(
  phone: string,
  since: Date,
  tx?: PrismaTransactionClient,
): Promise<OtpChallengeResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.otpChallenge.findFirst({
    where: {
      phone,
      consumedAt: null,
      createdAt: {
        gte: since,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createOtpChallengeRecord(
  input: CreateOtpChallengeInput,
  tx?: PrismaTransactionClient,
): Promise<OtpChallengeResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.otpChallenge.create({
    data: input,
  });
}

export async function findLatestOtpChallengeByPhone(
  phone: string,
  tx?: PrismaTransactionClient,
): Promise<OtpChallengeResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.otpChallenge.findFirst({
    where: {
      phone,
      consumedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function incrementOtpChallengeAttempts(
  id: string,
  tx?: PrismaTransactionClient,
): Promise<OtpChallengeResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.otpChallenge.update({
    where: {
      id,
    },
    data: {
      attemptCount: {
        increment: 1,
      },
    },
  });
}

export async function consumeOtpChallenge(
  id: string,
  tx?: PrismaTransactionClient,
): Promise<OtpChallengeResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.otpChallenge.update({
    where: {
      id,
    },
    data: {
      consumedAt: new Date(),
    },
  });
}
