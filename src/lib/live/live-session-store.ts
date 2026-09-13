import {
  OrganizationAccessDeniedError,
  requireOrganizationAccess
} from "../auth/organization-access";
import { db } from "../db";

import type {
  LiveSessionBinding,
  LiveSessionStatus
} from "./types";

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
        endedAt: new Date()
      }
    });

  return toLiveSessionBinding(session);
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
