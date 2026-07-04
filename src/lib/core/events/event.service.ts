import { createEvent } from "./event.repository";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateEventInput, EventResult } from "./event.types";

export async function recordEvent(
  input: CreateEventInput,
  tx?: PrismaTransactionClient,
): Promise<EventResult> {
  return createEvent(input, tx);
}
