import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptPlatformInvitation, InvitationInvalidError } from "../../../../../lib/platform/access-service";

export async function POST(request: Request) {
  try { const { token } = z.object({ token: z.string().min(20) }).parse(await request.json()); const value = await acceptPlatformInvitation(token); return NextResponse.json({ ok: true, email: value.user.email }); }
  catch (error) { if (error instanceof InvitationInvalidError) return NextResponse.json({ ok: false, code: error.code }, { status: 410 }); return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 }); }
}
