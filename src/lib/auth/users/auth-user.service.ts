import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { User } from "@prisma/client";

import { upsertAuthUserByPhone } from "./auth-user.repository";

export async function findOrCreateAuthUserByPhone(
  phone: string,
  tx?: PrismaTransactionClient,
): Promise<User> {
  return upsertAuthUserByPhone(phone, tx);
}
