import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../lib/auth/executive-session-context";
import { listDeliverableNotifications } from "../../../lib/notifications/notification-preferences";
import {
  NotificationNotFoundError,
  executeNotificationMarkRead
} from "../../../lib/actions/notification-mark-read";

const NO_STORE = { "Cache-Control": "no-store" };

const MarkReadSchema = z
  .object({ notificationId: z.string().trim().min(1).max(200) })
  .strict();

function authFailure(error: unknown) {
  if (error instanceof ExecutiveAuthenticationError) {
    return NextResponse.json(
      { ok: false, code: error.code },
      { status: error.status, headers: NO_STORE }
    );
  }

  return null;
}

/**
 * The signed-in user's own unread notifications, for the in-app toast.
 * Only display fields are returned — never sourceType/sourceId, the
 * organization or user ids, or any internal state. `id` is included solely
 * so the client can mark that notification read.
 */
export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    // Delivery preferences apply here — the persisted notifications are
    // untouched; this only decides what is shown proactively right now.
    const { notifications, unreadCount } = await listDeliverableNotifications({
      userId: auth.actorUserId,
      organizationId: auth.organizationId
    });

    return NextResponse.json(
      {
        ok: true,
        unreadCount,
        notifications: notifications.map(notification => ({
          id: notification.id,
          category: notification.category,
          priority: notification.priority,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt.toISOString()
        }))
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;

    throw error;
  }
}

/** Marks one of the signed-in user's own notifications read. */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON" },
      { status: 400, headers: NO_STORE }
    );
  }

  const parsed = MarkReadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_REQUEST" },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    await executeNotificationMarkRead({
      actorUserId: auth.actorUserId,
      organizationId: auth.organizationId,
      idempotencyKey: `ui-read:${parsed.data.notificationId}`,
      notificationId: parsed.data.notificationId
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;

    if (error instanceof NotificationNotFoundError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: 404, headers: NO_STORE }
      );
    }

    throw error;
  }
}
