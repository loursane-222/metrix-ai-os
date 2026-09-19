import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runAwarenessSweep } from "../../../../../lib/awareness/awareness-sweep";

// Never cached; this is a machine endpoint for a scheduler, not a page.
export const dynamic = "force-dynamic";

// An Executive evaluation is a model call; the sweep bounds its own work
// (see AWARENESS_TIME_BUDGET_MS) to stay inside this.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const actual = Buffer.from(header);
  const wanted = Buffer.from(expected);

  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/**
 * Protected Executive Awareness sweep — same protection as the reminder
 * sweep: a scheduler (or an operator) calls it with
 * `Authorization: Bearer $CRON_SECRET`; it fails closed without a configured
 * secret, carries no user session, and returns counts only — never event
 * content, notification text or ids. Re-running it is safe: every event is
 * evaluated once (see awareness-sweep.ts).
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

  const summary = await runAwarenessSweep();

  return NextResponse.json({ ok: true, ...summary }, { status: 200, headers: NO_STORE });
}

export const GET = handle;
export const POST = handle;
