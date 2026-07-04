import type { Session, User } from "@prisma/client";

export type AuthSessionResult = Session;

export type CreateSessionInput = {
  userId: string;
  rememberMe: boolean;
  expiresAt: Date;
};

export type CreatedSession = {
  session: AuthSessionResult;
  token: string;
};

export type ValidatedSession = Session & {
  user: User;
};
