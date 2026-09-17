import {
  OrganizationAccessDeniedError,
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";

import type {
  TurnResult
} from "../agent/turn-result";

import type {
  LiveSessionBinding,
  LiveSessionStatus
} from "./types";

// How long a delivered-but-unpolled result stays valid. This is a
// read-time cutoff only (no cron/cleanup job) — a plain defense against a
// session whose sideband never reached a normal close (crash, dropped
// connection) leaving stale business data resolvable indefinitely.
const LIVE_SESSION_RESULT_TTL_MS = 15 * 60 * 1000;

export type LiveSessionTurnResultState = {
  version: number;
  turnResult: TurnResult | null;
};

export class LiveSessionAccessDeniedError
  extends Error {
  readonly code = "LIVE_SESSION_ACCESS_DENIED";

  constructor() {
    super("Live session access denied");
    this.name = "LiveSessionAccessDeniedError";
  }
}

export class LiveSessionBindingNotFoundError
  extends Error {
  readonly code = "LIVE_SESSION_BINDING_NOT_FOUND";

  constructor() {
    super("Live session binding not found");
    this.name = "LiveSessionBindingNotFoundError";
  }
}

type PersistedLiveSession = {
  id: string;
  openAiSessionId: string | null;
  userId: string;
  organizationId: string;
  status: LiveSessionStatus;
  createdAt: Date;
  connectedAt: Date | null;
  sidebandAttachedAt: Date | null;
  endedAt: Date | null;
  failureCode: string | null;
};

function requireIdentifier(
  value: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new LiveSessionAccessDeniedError();
  }

  return normalized;
}

function toLiveSessionBinding(
  session: PersistedLiveSession
): LiveSessionBinding {
  return {
    id: session.id,
    openAiSessionId: session.openAiSessionId,
    userId: session.userId,
    organizationId: session.organizationId,
    status: session.status,
    createdAt: session.createdAt,
    connectedAt: session.connectedAt,
    sidebandAttachedAt: session.sidebandAttachedAt,
    endedAt: session.endedAt,
    failureCode: session.failureCode
  };
}

export async function createLiveSessionBinding(
  input: {
    actorUserId: string;
    organizationId: string;
  }
): Promise<LiveSessionBinding> {
  const session =
    await db.liveSession.create({
      data: {
        userId: requireIdentifier(input.actorUserId),
        organizationId:
          requireIdentifier(input.organizationId)
      }
    });

  return toLiveSessionBinding(session);
}

export async function bindOpenAiLiveSession(
  input: {
    bindingId: string;
    openAiSessionId: string;
  }
): Promise<LiveSessionBinding> {
  const bindingId =
    requireIdentifier(input.bindingId);

  const existing =
    await db.liveSession.findUnique({
      where: {
        id: bindingId
      }
    });

  if (!existing) {
    throw new LiveSessionBindingNotFoundError();
  }

  const session =
    await db.liveSession.update({
      where: {
        id: bindingId
      },
      data: {
        openAiSessionId:
          requireIdentifier(input.openAiSessionId),
        status: "CONNECTED",
        connectedAt: new Date()
      }
    });

  return toLiveSessionBinding(session);
}


export async function markLiveSessionFailed(
  input: {
    bindingId: string;
    failureCode: string;
  }
): Promise<LiveSessionBinding> {
  const bindingId =
    requireIdentifier(input.bindingId);

  const failureCode =
    requireIdentifier(input.failureCode);

  const existing =
    await db.liveSession.findUnique({
      where: {
        id: bindingId
      }
    });

  if (!existing) {
    throw new LiveSessionBindingNotFoundError();
  }

  const session =
    await db.liveSession.update({
      where: {
        id: bindingId
      },
      data: {
        status: "FAILED",
        failureCode,
        endedAt: new Date(),
        turnResultJson: null
      }
    });

  return toLiveSessionBinding(session);
}


export async function markLiveSidebandAttached(
  input: {
    bindingId: string;
  }
): Promise<LiveSessionBinding> {
  const bindingId =
    requireIdentifier(
      input.bindingId
    );

  const existing =
    await db.liveSession.findUnique({
      where: {
        id: bindingId
      }
    });

  if (!existing) {
    throw new LiveSessionBindingNotFoundError();
  }

  const session =
    await db.liveSession.update({
      where: {
        id: bindingId
      },
      data: {
        sidebandAttachedAt:
          new Date()
      }
    });

  return toLiveSessionBinding(
    session
  );
}

export async function markLiveSessionDisconnected(
  input: {
    bindingId: string;
  }
): Promise<LiveSessionBinding> {
  const bindingId =
    requireIdentifier(
      input.bindingId
    );

  const existing =
    await db.liveSession.findUnique({
      where: {
        id: bindingId
      }
    });

  if (!existing) {
    throw new LiveSessionBindingNotFoundError();
  }

  const session =
    await db.liveSession.update({
      where: {
        id: bindingId
      },
      data: {
        status:
          "DISCONNECTED",
        endedAt:
          new Date(),
        turnResultJson:
          null
      }
    });

  return toLiveSessionBinding(
    session
  );
}

/**
 * Persists the canonical TurnResult (capabilityResults + presentations)
 * produced by one successful Live business tool call — pure presentation/
 * delivery data, never a business decision. Bumps turnResultVersion
 * atomically so any reader can tell a duplicate delivery from a genuinely
 * new one.
 *
 * This durable write on the LiveSession row IS the delivery truth — the
 * only one. Nothing in-process (an EventEmitter, a Set, a Map) is ever
 * involved: proven unreliable as a delivery signal, since two different
 * Next.js route bundles can hold two entirely different module instances
 * of what looks like the same shared singleton, silently and without
 * error, and that divergence can even change mid-lifetime of a long-lived
 * connection as routes get recompiled. A reader (the result delivery
 * route) always re-derives freshness by re-reading this row, never by
 * being told about a write it may or may not have heard.
 */
export async function publishLiveSessionTurnResult(
  input: {
    bindingId: string;
    turnResult: TurnResult;
  }
): Promise<{ version: number }> {
  const bindingId =
    requireIdentifier(input.bindingId);

  const session =
    await db.liveSession.update({
      where: {
        id: bindingId
      },
      data: {
        turnResultVersion: {
          increment: 1
        },
        turnResultJson:
          JSON.stringify(input.turnResult),
        turnResultIssuedAt:
          new Date()
      },
      select: {
        turnResultVersion: true
      }
    });

  return {
    version: session.turnResultVersion
  };
}

/**
 * Reads the current delivery state for one binding, scoped to the
 * requesting actor/organization exactly like loadLiveSessionBinding — a
 * mismatch or unknown binding is treated as access-denied, never a
 * distinguishable 404 (no cross-tenant existence oracle). A result past
 * LIVE_SESSION_RESULT_TTL_MS old, or a session no longer CONNECTED, is
 * reported as no result even though the version number is preserved (so
 * the browser's monotonic comparison is unaffected).
 */
export async function loadLiveSessionTurnResultState(
  input: {
    bindingId: string;
    actorUserId: string;
    organizationId: string;
  }
): Promise<LiveSessionTurnResultState> {
  const bindingId =
    requireIdentifier(input.bindingId);

  try {
    await requireOrganizationAccess({
      userId: requireIdentifier(input.actorUserId),
      organizationId:
        requireIdentifier(input.organizationId)
    });
  } catch (error) {
    if (error instanceof OrganizationAccessDeniedError) {
      throw new LiveSessionAccessDeniedError();
    }

    throw error;
  }

  const session =
    await db.liveSession.findFirst({
      where: {
        id: bindingId,
        userId: input.actorUserId,
        organizationId: input.organizationId
      },
      select: {
        status: true,
        turnResultVersion: true,
        turnResultJson: true,
        turnResultIssuedAt: true
      }
    });

  if (!session) {
    throw new LiveSessionAccessDeniedError();
  }

  const isFresh =
    session.status === "CONNECTED" &&
    session.turnResultJson !== null &&
    session.turnResultIssuedAt !== null &&
    Date.now() - session.turnResultIssuedAt.getTime() <
      LIVE_SESSION_RESULT_TTL_MS;

  return {
    version: session.turnResultVersion,
    turnResult: isFresh
      ? (JSON.parse(session.turnResultJson as string) as TurnResult)
      : null
  };
}

/**
 * Reads the Sol/METRIX Executive Agent's OpenAI conversation id bound to
 * this Live session, if a client-delegation turn has already created one.
 * Internal, protocol-level lookup only (mirrors markLiveSidebandAttached's
 * id-only scoping) — the caller already holds a trusted LiveSessionBinding
 * for this id, so no separate actor/organization check is needed here.
 */
export async function loadLiveSessionExecutiveConversationId(
  input: {
    bindingId: string;
  }
): Promise<string | undefined> {
  const bindingId =
    requireIdentifier(input.bindingId);

  const session =
    await db.liveSession.findUnique({
      where: {
        id: bindingId
      },
      select: {
        executiveConversationId: true
      }
    });

  if (!session) {
    throw new LiveSessionBindingNotFoundError();
  }

  return session.executiveConversationId ?? undefined;
}

/**
 * Persists the Sol/METRIX Executive Agent's OpenAI conversation id for
 * this Live session, so the next client-delegation turn on the same
 * session reuses it (multi-turn business memory across one voice call).
 * Idempotent: writing the same id again is a no-op in effect.
 */
export async function persistLiveSessionExecutiveConversationId(
  input: {
    bindingId: string;
    executiveConversationId: string;
  }
): Promise<void> {
  const bindingId =
    requireIdentifier(input.bindingId);

  const executiveConversationId =
    requireIdentifier(input.executiveConversationId);

  await db.liveSession.update({
    where: {
      id: bindingId
    },
    data: {
      executiveConversationId
    }
  });
}

export async function loadLiveSessionBinding(
  input: {
    bindingId: string;
    actorUserId: string;
    organizationId: string;
  }
): Promise<LiveSessionBinding> {
  const bindingId =
    requireIdentifier(input.bindingId);

  let access: Awaited<
    ReturnType<typeof requireOrganizationAccess>
  >;

  try {
    access = await requireOrganizationAccess({
      userId: requireIdentifier(input.actorUserId),
      organizationId:
        requireIdentifier(input.organizationId)
    });
  } catch (error) {
    if (error instanceof OrganizationAccessDeniedError) {
      throw new LiveSessionAccessDeniedError();
    }

    throw error;
  }

  const session =
    await db.liveSession.findFirst({
      where: {
        id: bindingId,
        userId: access.userId,
        organizationId: access.organizationId
      }
    });

  if (!session) {
    throw new LiveSessionAccessDeniedError();
  }

  return toLiveSessionBinding(session);
}
