import {
  NextResponse
} from "next/server";

import {
  z
} from "zod";

import {
  runMetrixExecutiveTurn
} from "../../../lib/agent/metrix-executive-agent";

const MetrixRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1)
    .max(10_000),

  actorUserId: z
    .string()
    .trim()
    .min(1)
    .max(256),

  organizationId: z
    .string()
    .trim()
    .min(1)
    .max(256),

  turnId: z
    .string()
    .trim()
    .min(1)
    .max(256)
}).strict();

export async function POST(
  request: Request
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_JSON"
      },
      {
        status: 400
      }
    );
  }

  const parsed =
    MetrixRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_REQUEST"
      },
      {
        status: 400
      }
    );
  }

  const result =
    await runMetrixExecutiveTurn(
      parsed.data
    );

  return NextResponse.json({
    ok: true,
    finalOutput:
      result.finalOutput,
    executionItems:
      result.executionItems
  });
}
