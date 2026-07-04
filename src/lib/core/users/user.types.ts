import type { User } from "@prisma/client";

export type CreateUserInput = {
  phone: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type UserResult = User;
