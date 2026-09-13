import {
  createHash
} from "node:crypto";

import {
  db
} from "../db";

export const METRIX_SESSION_COOKIE =
  "metrix_session";

export class ExecutiveAuthenticationError
  extends Error {
  readonly code:
    | "UNAUTHENTICATED"
    | "ORGANIZATION_NOT_FOUND";

  readonly status:
    | 401
    | 403;

  constructor(
    code:
      | "UNAUTHENTICATED"
      | "ORGANIZATION_NOT_FOUND",
    status:
      | 401
      | 403
  ) {
    super(code);

    this.name =
      "ExecutiveAuthenticationError";

    this.code =
      code;

    this.status =
      status;
  }
}

export type AuthenticatedExecutiveContext = {
  actorUserId: string;
  organizationId: string;
  timezone: string;
  referenceTimeIso: string;
};

export function hashSessionToken(
  token: string
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function readCookie(
  request: Request,
  name: string
): string | undefined {
  const cookieHeader =
    request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (
    const rawPart
    of cookieHeader.split(";")
  ) {
    const part =
      rawPart.trim();

    const separator =
      part.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const cookieName =
      part
        .slice(0, separator)
        .trim();

    if (
      cookieName !== name
    ) {
      continue;
    }

    const rawValue =
      part.slice(
        separator + 1
      );

    try {
      return decodeURIComponent(
        rawValue
      );
    } catch {
      return rawValue;
    }
  }

  return undefined;
}

export async function resolveAuthenticatedExecutiveContext(
  request: Request
): Promise<AuthenticatedExecutiveContext> {
  const token =
    readCookie(
      request,
      METRIX_SESSION_COOKIE
    )?.trim();

  if (!token) {
    throw new ExecutiveAuthenticationError(
      "UNAUTHENTICATED",
      401
    );
  }

  const now =
    new Date();

  const session =
    await db.session.findUnique({
      where: {
        tokenHash:
          hashSessionToken(
            token
          )
      },
      include: {
        user: true
      }
    });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= now
  ) {
    throw new ExecutiveAuthenticationError(
      "UNAUTHENTICATED",
      401
    );
  }

  const membership =
    await db.organizationMember.findFirst({
      where: {
        userId:
          session.userId
      },
      orderBy: {
        createdAt:
          "asc"
      },
      select: {
        organizationId:
          true
      }
    });

  if (!membership) {
    throw new ExecutiveAuthenticationError(
      "ORGANIZATION_NOT_FOUND",
      403
    );
  }

  await db.session.update({
    where: {
      id:
        session.id
    },
    data: {
      lastUsedAt:
        now
    }
  });

  return {
    actorUserId:
      session.user.id,

    organizationId:
      membership.organizationId,

    timezone:
      session.user.timezone,

    referenceTimeIso:
      now.toISOString()
  };
}
