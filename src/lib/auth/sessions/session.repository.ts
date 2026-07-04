import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

import type {
  AuthSessionResult,
  CreateSessionInput,
  ValidatedSession,
} from "./session.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createSessionRecord(
  input: CreateSessionInput & { tokenHash: string },
  tx?: PrismaTransactionClient,
): Promise<AuthSessionResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.session.create({
    data: input,
  });
}

export async function findSessionByTokenHash(
  tokenHash: string,
  tx?: PrismaTransactionClient,
): Promise<ValidatedSession | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.session.findUnique({
    where: {
      tokenHash,
    },
    include: {
      user: true,
    },
  });
}

export async function touchSessionRecord(
  id: string,
  tx?: PrismaTransactionClient,
): Promise<AuthSessionResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.session.update({
    where: {
      id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });
}

export async function revokeSessionByTokenHash(
  tokenHash: string,
  tx?: PrismaTransactionClient,
): Promise<AuthSessionResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const session = await client.session.findUnique({
    where: {
      tokenHash,
    },
  });

  if (!session) {
    return null;
  }

  return client.session.update({
    where: {
      id: session.id,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
