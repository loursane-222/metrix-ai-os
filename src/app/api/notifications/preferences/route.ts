import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../lib/auth/executive-session-context";
import {
  NotificationPreferenceVerificationError,
  loadNotificationPreferences,
  updateNotificationPreferences
} from "../../../../lib/notifications/notification-preferences";

const NO_STORE = { "Cache-Control": "no-store" };

// Only the five user-facing switches; an unknown key is rejected. Identity
// is never taken from the body — only from the authenticated session.
const PatchSchema = z
  .object({
    critical: z.boolean().optional(),
    finance: z.boolean().optional(),
    sales: z.boolean().optional(),
    tasks: z.boolean().optional(),
    muteAll: z.boolean().optional()
  })
  .strict()
  .refine(patch => Object.keys(patch).length > 0, {
    message: "At least one preference is required"
  });

function authFailure(error: unknown) {
  if (error instanceof ExecutiveAuthenticationError) {
    return NextResponse.json(
      { ok: false, code: error.code },
      { status: error.status, headers: NO_STORE }
    );
  }

  return null;
}

/** The signed-in user's own notification preferences. */
export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    return NextResponse.json(
      { ok: true, preferences: await loadNotificationPreferences(auth.actorUserId) },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;

    throw error;
  }
}

/** Updates the signed-in user's own preferences and returns the verified result. */
export async function PUT(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON" },
      { status: 400, headers: NO_STORE }
    );
  }

  const parsed = PatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_REQUEST" },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const auth = await resolveAuthenticatedExecutiveContext(request);

    const preferences = await updateNotificationPreferences({
      actorUserId: auth.actorUserId,
      patch: parsed.data
    });

    return NextResponse.json(
      { ok: true, preferences },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;

    if (error instanceof NotificationPreferenceVerificationError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: 500, headers: NO_STORE }
      );
    }

    throw error;
  }
}
