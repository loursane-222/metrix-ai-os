import { createHash } from "crypto";

import { Prisma } from "@prisma/client";

/**
 * Deterministik, alan sırasından etkilenmeyen bir istek hash'i üretir.
 * Yalnızca create işleminin normalize edilmiş iş alanlarından oluşmalı —
 * organizationId dahil edilmez (unique constraint zaten tenant-scoped).
 */
export function computeRequestHash(fields: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(fields).sort()) {
    normalized[key] = fields[key] ?? null;
  }

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/**
 * Quote/Payment create çağrısında yakalanan bir hatanın, gerçekten
 * (organizationId, idempotencyKey) unique constraint çakışması olup
 * olmadığını belirler. Başka bir Prisma hatasını (ör. FK ihlali,
 * bağlantı hatası) idempotency collision gibi yorumlamaz.
 */
export function isIdempotencyKeyCollision(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
