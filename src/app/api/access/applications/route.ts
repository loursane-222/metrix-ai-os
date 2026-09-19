import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessApplicationConflictError, submitAccessApplication } from "../../../../lib/platform/access-service";

const schema = z.object({ name: z.string(), company: z.string(), email: z.string(), phone: z.string().optional(), note: z.string().optional() }).strict();
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const application = await submitAccessApplication(body);
    return NextResponse.json({ ok: true, application: { id: application.id, status: application.status } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccessApplicationConflictError) return NextResponse.json({ ok: false, code: error.code }, { status: 409 });
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }
}
