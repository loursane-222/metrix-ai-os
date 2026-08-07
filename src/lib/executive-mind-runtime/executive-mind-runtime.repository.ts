import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PutExecutiveMindRuntimeStateInput } from "./executive-mind-runtime.types";

export function findExecutiveMindRuntimeStateRecord(organizationId: string) {
  return prisma.executiveMindRuntimeStateRecord.findUnique({
    where: { organizationId },
  });
}

export function upsertExecutiveMindRuntimeStateRecord(
  input: PutExecutiveMindRuntimeStateInput,
) {
  const workingMemoryJson = toJson(input.workingMemory);
  const hypothesesJson = toJson(input.hypotheses);
  const beliefsJson = toJson(input.beliefs);
  return prisma.executiveMindRuntimeStateRecord.upsert({
    where: { organizationId: input.organizationId },
    update: {
      attentionFocus: input.attentionFocus,
      workingMemoryJson,
      hypothesesJson,
      beliefsJson,
    },
    create: {
      organizationId: input.organizationId,
      attentionFocus: input.attentionFocus,
      workingMemoryJson,
      hypothesesJson,
      beliefsJson,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
