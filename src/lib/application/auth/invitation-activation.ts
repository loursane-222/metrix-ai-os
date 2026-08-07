import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

export async function activateInvitedMemberships(userId: string, tx: PrismaTransactionClient): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: { memberships: { updateMany: { where: { status: "INVITED" }, data: { status: "ACTIVE", joinedAt: new Date() } } } },
  });
}
