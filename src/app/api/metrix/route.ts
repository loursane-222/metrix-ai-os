import {
  NextResponse
} from "next/server";

import {
  z
} from "zod";

import {
  runMetrixExecutiveTurn
} from "../../../lib/agent/metrix-executive-agent";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../lib/auth/executive-session-context";

const MetrixRequestSchema =
  z.object({
    message: z
      .string()
      .trim()
      .min(1)
      .max(10_000),

    turnId: z
      .string()
      .trim()
      .min(1)
      .max(256)
  })
  .strict();

export async function POST(
  request: Request
) {
  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        ok:
          false,
        code:
          "INVALID_JSON"
      },
      {
        status:
          400
      }
    );
  }

  const parsed =
    MetrixRequestSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok:
          false,
        code:
          "INVALID_REQUEST"
      },
      {
        status:
          400
      }
    );
  }

  try {
    const auth =
      await resolveAuthenticatedExecutiveContext(
        request
      );

    const result =
      await runMetrixExecutiveTurn({
        actorUserId:
          auth.actorUserId,

        organizationId:
          auth.organizationId,

        timezone:
          auth.timezone,

        referenceTimeIso:
          auth.referenceTimeIso,

        turnId:
          parsed.data.turnId,

        message:
          parsed.data.message
      });

    return NextResponse.json({
      ok:
        true,

      finalOutput:
        result.finalOutput,

      executionItems:
        result.executionItems
    });
  } catch (error) {
    if (
      error
      instanceof
      ExecutiveAuthenticationError
    ) {
      return NextResponse.json(
        {
          ok:
            false,
          code:
            error.code
        },
        {
          status:
            error.status
        }
      );
    }

    throw error;
  }
}
