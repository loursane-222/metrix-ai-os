import {
  NextResponse
} from "next/server";
import {
  z
} from "zod";
import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../lib/auth/executive-session-context";
import {
  InvalidLiveSdpError,
  LiveSessionBootstrapError,
  bootstrapLiveSession
} from "../../../../../lib/live/live-session-service";

const LiveSessionRequestSchema =
  z
    .object({
      sdp:
        z.string()
    })
    .strict();

function jsonNoStore(
  body: unknown,
  status: number
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store"
      }
    }
  );
}

export async function POST(
  request: Request
) {
  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return jsonNoStore(
      {
        ok: false,
        code:
          "INVALID_JSON"
      },
      400
    );
  }

  const parsed =
    LiveSessionRequestSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return jsonNoStore(
      {
        ok: false,
        code:
          "INVALID_REQUEST"
      },
      400
    );
  }

  try {
    const auth =
      await resolveAuthenticatedExecutiveContext(
        request
      );

    const result =
      await bootstrapLiveSession({
        sdp:
          parsed.data.sdp,
        auth
      });

    return jsonNoStore(
      {
        bindingId:
          result.bindingId,
        answerSdp:
          result.answerSdp,
        voice:
          result.voice
      },
      201
    );
  } catch (error) {
    if (
      error
        instanceof
        ExecutiveAuthenticationError
    ) {
      return jsonNoStore(
        {
          ok: false,
          code:
            error.code
        },
        error.status
      );
    }

    if (
      error
        instanceof
        InvalidLiveSdpError
    ) {
      return jsonNoStore(
        {
          ok: false,
          code:
            error.code
        },
        400
      );
    }

    if (
      error
        instanceof
        LiveSessionBootstrapError
    ) {
      return jsonNoStore(
        {
          ok: false,
          code:
            error.code
        },
        502
      );
    }

    throw error;
  }
}
