import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { PersonResult } from "./person.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function findPersonById(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<PersonResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.person.findFirst({
    where: { id, organizationId },
  });
}
