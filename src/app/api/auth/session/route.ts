import { NextResponse } from "next/server";

import { resolveCurrentSession } from "../../../../lib/auth/current-session";

export async function GET(request: Request) {
  const session = await resolveCurrentSession(request);

  if (!session) {
    return NextResponse.json(
      { ok: true, authenticated: false },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      authenticated: true,
      user: { id: session.userId, email: session.email },
      organization: session.organizationId
        ? { id: session.organizationId, name: session.organizationName }
        : null
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
