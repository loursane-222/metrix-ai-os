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
  ExecutiveConversationNotFoundError,
  createExecutiveConversationBinding,
  loadExecutiveConversationBinding,
  touchExecutiveConversationBinding
} from "../../../lib/agent/executive-conversation-store";

import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../lib/auth/executive-session-context";

import {
  createTurnResult
} from "../../../lib/agent/turn-result";

import {
  projectCapabilityResults
} from "../../../lib/presentation/project-result";

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
      .max(256),

    conversationId: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .optional()
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

    const existingBinding =
      parsed.data.conversationId
        ? await loadExecutiveConversationBinding({
            conversationId:
              parsed.data.conversationId,
            actorUserId:
              auth.actorUserId,
            organizationId:
              auth.organizationId
          })
        : undefined;

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
          parsed.data.message,

        openAiConversationId:
          existingBinding?.openAiConversationId
      });

    const conversationHandle =
      existingBinding
        ? await touchExecutiveConversationBinding({
            conversationId:
              existingBinding.id
          }).then(
            () => existingBinding.id
          )
        : await createExecutiveConversationBinding({
            actorUserId:
              auth.actorUserId,
            organizationId:
              auth.organizationId,
            openAiConversationId:
              result.openAiConversationId
          }).then(
            binding => binding.id
          );

    const capabilityResults =
      result.capabilityResults ?? [];

    const turnResult = createTurnResult({
      executiveText: result.finalOutput,
      capabilityResults,
      presentations: projectCapabilityResults(capabilityResults)
    });

    return NextResponse.json({
      ok:
        true,

      turnResult,

      conversationId:
        conversationHandle
    });
  } catch (error) {
    if (
      error
      instanceof
      ExecutiveConversationNotFoundError
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
            404
        }
      );
    }

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
