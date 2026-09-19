import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runReminderSweep } from "../../../../../lib/notifications/reminder-sweep";

// Never cached; this is a machine endpoint for a scheduler, not a page.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const actual = Buffer.from(header);
  const wanted = Buffer.from(expected);

  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/**
 * Protected reminder sweep. A scheduler (Vercel Cron sends GET with
 * `Authorization: Bearer $CRON_SECRET`) or an operator with the secret
 * calls it. It fails closed: with no CRON_SECRET configured it refuses
 * every request, and a wrong/missing secret is a 401. It carries no user
 * session and returns counts only — never notification content or ids.
 * Reprocessing is safe: the sweep is idempotent, which also covers a
 * scheduler's occasional missed or duplicated delivery.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret || secret.trim().length === 0) {
    return NextResponse.json(
      { ok: false, code: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 503, headers: NO_STORE }
    );
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE }
    );
  }

  const summary = await runReminderSweep();

  return NextResponse.json({ ok: true, ...summary }, { status: 200, headers: NO_STORE });
}

export const GET = handle;
export const POST = handle;
