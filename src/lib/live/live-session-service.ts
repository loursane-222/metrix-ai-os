import OpenAI from "openai";
import {
  z
} from "zod";

import type {
  AuthenticatedExecutiveContext
} from "../auth/executive-session-context";

import {
  bindOpenAiLiveSession,
  createLiveSessionBinding,
  markLiveSessionFailed
} from "./live-session-store";

import {
  buildLiveSessionConfig,
  METRIX_LIVE_VOICE
} from "./live-session-config";

import {
  attachLiveSideband
} from "./live-sideband-service";

const LiveSdpSchema =
  z
    .string()
    .trim()
    .min(1)
    .max(100_000);

export class InvalidLiveSdpError
  extends Error {
  readonly code =
    "INVALID_SDP";

  constructor() {
    super(
      "Invalid Live SDP offer"
    );

    this.name =
      "InvalidLiveSdpError";
  }
}

export class LiveSessionBootstrapError
  extends Error {
  readonly code =
    "LIVE_SESSION_CREATE_FAILED";

  constructor() {
    super(
      "Live session creation failed"
    );

    this.name =
      "LiveSessionBootstrapError";
  }
}

const LIVE_SIDEBAND_READY_TIMEOUT_MS =
  10_000;

export type LiveSessionBootstrapResult = {
  bindingId: string;
  answerSdp: string;
  voice: typeof METRIX_LIVE_VOICE;
};

function parseSdp(
  value: string
): string {
  const parsed =
    LiveSdpSchema.safeParse(value);

  if (!parsed.success) {
    throw new InvalidLiveSdpError();
  }

  return parsed.data;
}

function requireOpaqueIdentifier(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new LiveSessionBootstrapError();
  }

  return value.trim();
}

export async function bootstrapLiveSession(
  input: {
    sdp: string;
    auth: AuthenticatedExecutiveContext;
  }
): Promise<LiveSessionBootstrapResult> {
  const sdp =
    parseSdp(input.sdp);

  const binding =
    await createLiveSessionBinding({
      actorUserId:
        input.auth.actorUserId,

      organizationId:
        input.auth.organizationId
    });

  let failureCode =
    "LIVE_SESSION_CREATE_FAILED";

  try {
    const client =
      new OpenAI();

    const result =
      await client.live.create({
        session:
          buildLiveSessionConfig({
            timezone:
              input.auth.timezone,

            referenceTimeIso:
              input.auth.referenceTimeIso,

            voice:
              METRIX_LIVE_VOICE
          }),

        transport: {
          type: "webrtc",
          sdp
        }
      });

    const openAiSessionId =
      requireOpaqueIdentifier(
        result.session?.id
      );

    const answerSdp =
      requireOpaqueIdentifier(
        result.transport?.sdp
      );

    const connectedBinding =
      await bindOpenAiLiveSession({
        bindingId:
          binding.id,

        openAiSessionId
      });

    failureCode =
      "LIVE_SIDEBAND_FAILED";

    const sidebandHandle =
      attachLiveSideband({
      binding:
        connectedBinding,
      auth:
        input.auth
    });

    let readinessTimeout:
      ReturnType<typeof setTimeout>
      | undefined;

    const boundedReadiness =
      new Promise<never>(
        (_, reject) => {
          readinessTimeout =
            setTimeout(
              () => {
                reject(
                  new Error(
                    "Live sideband readiness timed out"
                  )
                );
              },
              LIVE_SIDEBAND_READY_TIMEOUT_MS
            );
        }
      );

    try {
      await Promise.race([
        sidebandHandle.ready,
        boundedReadiness
      ]);
    } catch (error) {
      sidebandHandle.close({
        failed:
          true
      });

      throw error;
    } finally {
      if (
        readinessTimeout !==
        undefined
      ) {
        clearTimeout(
          readinessTimeout
        );
      }
    }

    return {
      bindingId:
        binding.id,

      answerSdp,

      voice:
        METRIX_LIVE_VOICE
    };
  } catch {
    try {
      await markLiveSessionFailed({
        bindingId:
          binding.id,

        failureCode
      });
    } catch {
      // Preserve the stable bootstrap error.
    }

    throw new LiveSessionBootstrapError();
  }
}
