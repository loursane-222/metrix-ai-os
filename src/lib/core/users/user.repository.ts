import { prisma } from "@/lib/core/shared/prisma";

import type { CreateUserInput, UserResult } from "./user.types";

export async function createUserRecord(
  input: CreateUserInput,
): Promise<UserResult> {
  return prisma.user.create({
    data: {
      phone: input.phone,
      fullName: input.fullName,
      email: input.email,
      avatarUrl: input.avatarUrl,
    },
  });
}

export async function findUserRecordByPhone(
  phone: string,
): Promise<UserResult | null> {
  return prisma.user.findUnique({
    where: {
      phone,
    },
  });
}

export async function findUserRecordById(id: string): Promise<UserResult | null> {
  return prisma.user.findUnique({
    where: {
      id,
    },
  });
}
