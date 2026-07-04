import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateEventInput, EventResult } from "./event.types";

export async function createEvent(
  input: CreateEventInput,
  tx?: PrismaTransactionClient,
): Promise<EventResult> {
  const client = tx ?? prisma;

  return client.event.create({
    data: input,
  });
}
