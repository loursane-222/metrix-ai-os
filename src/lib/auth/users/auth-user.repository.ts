import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { User } from "@prisma/client";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function upsertAuthUserByPhone(
  phone: string,
  tx?: PrismaTransactionClient,
): Promise<User> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.user.upsert({
    where: {
      phone,
    },
    create: {
      phone,
      email: phone,
    },
    update: {
      lastActiveAt: new Date(),
      email: phone,
    },
  });
}
