import { NextResponse } from "next/server";
import { z } from "zod";

import { requestLoginOtp } from "../../../../../lib/actions/auth-login";

const RequestSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    rememberMe: z.boolean().optional()
  })
  .strict();

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonNoStore({ ok: false, code: "INVALID_REQUEST" }, 400);
  }

  try {
    const result = await requestLoginOtp({
      email: parsed.data.email,
      rememberMe: parsed.data.rememberMe ?? true
    });

    return jsonNoStore({ ok: true, data: result }, 200);
  } catch {
    return jsonNoStore({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
}
