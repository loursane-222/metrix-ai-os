import type { User } from "@prisma/client";

export type CreateUserInput = {
  phone: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type UpdateUserProfileInput = {
  fullName?: string;
  email?: string;
  timezone?: string;
  voicePreference?: string;
};

export type UserResult = User;
