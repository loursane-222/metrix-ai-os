import type { ConnectClientEvent } from "openai/resources/live/sideband/sideband";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError
} from "openai";

import {
  AgentsError,
  GuardrailExecutionError,
  InputGuardrailTripwireTriggered,
  InvalidToolOutputError,
  MaxTurnsExceededError,
  ModelBehaviorError,
  ModelRefusalError,
  ModelTimeoutError,
  OutputGuardrailTripwireTriggered,
  ToolCallError,
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
  ToolTimeoutError
} from "@openai/agents";

import type {
  AuthenticatedExecutiveContext
} from "../auth/executive-session-context";

import {
  runMetrixExecutiveTurn
} from "../agent/metrix-executive-agent";

import {
  createTurnResult
} from "../agent/turn-result";

import type {
  CanonicalCapabilityResult
} from "../agent/turn-result";

import {
  projectCapabilityResults
} from "../presentation/project-result";

import {
  recordLiveLifecycle
} from "./live-observability";

import {
  loadLiveSessionExecutiveConversationId,
  persistLiveSessionExecutiveConversationId,
  publishLiveSessionTurnResult
} from "./live-session-store";

import type {
  LiveSessionBinding
} from "./types";

type DelegationBridgeSender = {
  // Same "attempted, not acknowledged" contract as the retired
  // SidebandSender in live-sideband-service.ts — see that file's doc
  // comment for the full rationale. Reused verbatim here.
  send(event: ConnectClientEvent): boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(
  value: unknown
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function readString(
  record: UnknownRecord,
  key: string
): string | undefined {
  const value = record[key];

  return (
    typeof value === "string" &&
    value.trim()
  )
    ? value
    : undefined;
}

// Conservative character-based proxy for session.commentary.append's
// documented 500-token cap. No tokenizer is wired into this boundary —
// this is a safety margin against a rejected send, not a token count.
const COMMENTARY_MAX_CHARS = 1800;

const GRACEFUL_EMPTY_TRANSCRIPT_REPLY =
  "Az önce ne istediğini tam olarak anlayamadım, tekrar söyler misin?";

const GRACEFUL_EXECUTIVE_FAILURE_REPLY =
  "Bunu şu anda tamamlayamadım, tekrar dener misin?";

function truncateForCommentary(
  content: string
): string {
  return content.length > COMMENTARY_MAX_CHARS
    ? content.slice(
        0,
        COMMENTARY_MAX_CHARS
      )
    : content;
}

export type ExecutiveTurnFailureClassification = {
  errorClass?: string;
  errorType?: string;
  errorCode?: string;
  errorStatus?: number;
  errorCategory: string;
};

// The OpenAI-SDK-error part of the classification — pulled out on its own
// so both a directly-thrown APIError and one wrapped one level deep
// inside a ToolCallError/GuardrailExecutionError.error resolve to the
// same, precise category/status/type/code.
function classifyApiError(
  error: unknown
): Omit<ExecutiveTurnFailureClassification, "errorClass"> | undefined {
  if (!(error instanceof APIError)) {
    return undefined;
  }

  const errorStatus =
    typeof error.status === "number"
      ? error.status
      : undefined;

  const errorType = error.type;

  const errorCode =
    typeof error.code === "string"
      ? error.code
      : undefined;

  if (error instanceof RateLimitError) {
    return { errorType, errorCode, errorStatus, errorCategory: "RATE_LIMIT" };
  }

  if (error instanceof AuthenticationError) {
    return { errorType, errorCode, errorStatus, errorCategory: "AUTH" };
  }

  if (error instanceof PermissionDeniedError) {
    return {
      errorType,
      errorCode,
      errorStatus,
      errorCategory: "PERMISSION_DENIED"
    };
  }

  // Subclass of APIConnectionError — must be checked first.
  if (error instanceof APIConnectionTimeoutError) {
    return { errorType, errorCode, errorStatus, errorCategory: "TIMEOUT" };
  }

  if (error instanceof APIConnectionError) {
    return { errorType, errorCode, errorStatus, errorCategory: "NETWORK" };
  }

  if (error instanceof InternalServerError) {
    return {
      errorType,
      errorCode,
      errorStatus,
      errorCategory: "SERVER_ERROR"
    };
  }

  if (error instanceof BadRequestError) {
    return { errorType, errorCode, errorStatus, errorCategory: "BAD_REQUEST" };
  }

  if (error instanceof NotFoundError) {
    return { errorType, errorCode, errorStatus, errorCategory: "NOT_FOUND" };
  }

  if (error instanceof APIUserAbortError) {
    return { errorType, errorCode, errorStatus, errorCategory: "ABORTED" };
  }

  return { errorType, errorCode, errorStatus, errorCategory: "API_ERROR" };
}

/**
 * Sanitized, class-based failure classification for a failed backend
 * Executive turn (runMetrixExecutiveTurn). Reads only the thrown value's
 * own type identity and structured fields the OpenAI/Agents SDKs
 * document as safe (HTTP status, error type/code) — never `.message`,
 * `.cause`'s message, prompt/transcript content, tool arguments, or
 * model output, from this error or from an error it wraps one level
 * deep (ToolCallError.error / GuardrailExecutionError.error).
 */
export function classifyExecutiveTurnFailure(
  error: unknown
): ExecutiveTurnFailureClassification {
  const errorClass =
    error instanceof Error
      ? error.constructor?.name || "Error"
      : typeof error;

  const directApiClassification = classifyApiError(error);

  if (directApiClassification) {
    return { errorClass, ...directApiClassification };
  }

  if (error instanceof ModelTimeoutError) {
    return { errorClass, errorCategory: "TIMEOUT" };
  }

  if (error instanceof MaxTurnsExceededError) {
    return { errorClass, errorCategory: "MAX_TURNS_EXCEEDED" };
  }

  if (error instanceof ModelRefusalError) {
    return { errorClass, errorCategory: "MODEL_REFUSAL" };
  }

  if (
    error instanceof InputGuardrailTripwireTriggered ||
    error instanceof OutputGuardrailTripwireTriggered ||
    error instanceof ToolInputGuardrailTripwireTriggered ||
    error instanceof ToolOutputGuardrailTripwireTriggered
  ) {
    return { errorClass, errorCategory: "GUARDRAIL_TRIPWIRE" };
  }

  if (error instanceof GuardrailExecutionError) {
    const wrapped = classifyApiError(error.error);

    return wrapped
      ? { errorClass, ...wrapped }
      : { errorClass, errorCategory: "GUARDRAIL_EXECUTION" };
  }

  if (error instanceof ToolTimeoutError) {
    return { errorClass, errorCategory: "TOOL_TIMEOUT" };
  }

  if (error instanceof ToolCallError) {
    const wrapped = classifyApiError(error.error);

    return wrapped
      ? { errorClass, ...wrapped }
      : { errorClass, errorCategory: "TOOL_EXECUTION" };
  }

  if (error instanceof InvalidToolOutputError) {
    return { errorClass, errorCategory: "TOOL_OUTPUT_VALIDATION" };
  }

  if (error instanceof ModelBehaviorError) {
    return { errorClass, errorCategory: "MODEL_BEHAVIOR" };
  }

  // Base AgentsError (UserError/SystemError or any future subclass not
  // specifically matched above) — still a deterministic, safe bucket,
  // just coarser. Checked by actual type, never by guessing from a class
  // name, so an unrelated Error subclass never gets mislabeled.
  if (error instanceof AgentsError) {
    return { errorClass, errorCategory: "AGENTS_SDK_ERROR" };
  }

  return { errorClass, errorCategory: "UNKNOWN" };
}

/**
 * The client-delegation replacement for the retired Responses-delegation
 * sideband protocol (createLiveSidebandProtocol). GPT-Live-1 never
 * selects or executes a canonical tool itself under either Live API
 * delegation mode (confirmed against the installed SDK and the official
 * gpt-live-1 docs) — under client delegation it only ever signals
 * `session.delegation.created` and expects a spoken/silent reply keyed
 * by the delegation id. Sol (the same Agent/tool set runMetrixExecutiveTurn
 * already runs for text) is the single backend Executive semantic owner
 * that decides what to do; this bridge is transport plumbing around that
 * call, not a second decision-maker.
 */
export function createLiveDelegationBridge(
  input: {
    binding: LiveSessionBinding;
    auth: AuthenticatedExecutiveContext;
    send: DelegationBridgeSender["send"];
  }
) {
  if (
    input.binding.userId !==
      input.auth.actorUserId ||
    input.binding.organizationId !==
      input.auth.organizationId
  ) {
    throw new Error(
      "Live trusted context mismatch"
    );
  }

  // Accumulated user-speech transcript since the last delegation event
  // was consumed. The Live API defines no transcript-done boundary
  // (InputTranscriptDeltaEvent's own doc comment: "these events do not
  // define complete turns or include a transcript-done event") — a
  // client-delegation event IS the boundary this bridge uses: everything
  // accumulated since the previous one is the utterance being delegated.
  // Pure context buffering only — never inspected, branched on, or
  // classified; that judgment belongs entirely to Sol.
  let pendingTranscript = "";

  // Guards one delegation_id from being handled twice (e.g. a sideband
  // event redelivered across a reconnect) — idempotency, not routing.
  const handledDelegationIds =
    new Set<string>();

  function sendCommentary(
    delegationId: string,
    content: string
  ): void {
    const sent =
      input.send({
        type:
          "session.commentary.append",
        delegation_id:
          delegationId,
        content:
          truncateForCommentary(
            content
          )
      });

    recordLiveLifecycle({
      bindingId:
        input.binding.id,
      openAiSessionId:
        input.binding
          .openAiSessionId ??
        undefined,
      delegationId,
      phase:
        "COMMENTARY",
      status:
        sent
          ? "SUBMITTED"
          : "SEND_FAILED",
      direction:
        "outbound"
    });
  }

  /**
   * Mirrors deliverTurnResultForSuccessfulCall's principle from the
   * retired protocol exactly (same publish target, same "best-effort,
   * never turn a successful turn into a reported failure" contract) —
   * only the input shape changes: the whole turn's capabilityResults at
   * once (runMetrixExecutiveTurn's own return shape), not one tool call
   * at a time, since client delegation carries no OpenAI-protocol
   * continuation step for this to be decoupled from.
   */
  async function deliverTurnResult(
    delegationId: string,
    capabilityResults: CanonicalCapabilityResult[]
  ): Promise<void> {
    if (capabilityResults.length === 0) {
      return;
    }

    const presentations =
      projectCapabilityResults(
        capabilityResults
      );

    if (presentations.length === 0) {
      return;
    }

    const turnResult =
      createTurnResult({
        executiveText: "",
        capabilityResults,
        presentations
      });

    try {
      const published =
        await publishLiveSessionTurnResult({
          bindingId:
            input.binding.id,
          turnResult
        });

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId,
        phase:
          "RESULT_DELIVERY",
        status:
          `PUBLISHED:${published.version}`,
        direction:
          "internal"
      });
    } catch {
      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId,
        phase:
          "RESULT_DELIVERY",
        status:
          "PUBLISH_FAILED",
        direction:
          "internal"
      });
    }
  }

  async function handleDelegationCreated(
    delegation: {
      id: string;
      target: string;
    }
  ): Promise<void> {
    if (delegation.target !== "client") {
      // Not this bridge's concern — a Responses-delegation event under a
      // differently-configured session, or a future target this bridge
      // does not yet know about.
      return;
    }

    if (handledDelegationIds.has(delegation.id)) {
      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId:
          delegation.id,
        phase:
          "DELEGATION",
        status:
          "DUPLICATE_IGNORED",
        direction:
          "inbound"
      });

      return;
    }

    handledDelegationIds.add(
      delegation.id
    );

    const message =
      pendingTranscript.trim();

    pendingTranscript = "";

    recordLiveLifecycle({
      bindingId:
        input.binding.id,
      openAiSessionId:
        input.binding
          .openAiSessionId ??
        undefined,
      delegationId:
        delegation.id,
      phase:
        "DELEGATION",
      status:
        message
          ? "RECEIVED"
          : "RECEIVED_EMPTY_TRANSCRIPT",
      direction:
        "inbound"
    });

    if (!message) {
      // Nothing to act on. This bridge never guesses intent from
      // silence — a graceful spoken fallback keeps the session
      // responsive without inventing a business action.
      sendCommentary(
        delegation.id,
        GRACEFUL_EMPTY_TRANSCRIPT_REPLY
      );

      return;
    }

    try {
      const openAiConversationId =
        await loadLiveSessionExecutiveConversationId({
          bindingId:
            input.binding.id
        });

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId:
          delegation.id,
        phase:
          "EXECUTIVE_TURN",
        status:
          "START",
        direction:
          "internal"
      });

      const result =
        await runMetrixExecutiveTurn({
          actorUserId:
            input.auth.actorUserId,
          organizationId:
            input.auth.organizationId,
          turnId:
            delegation.id,
          message,
          timezone:
            input.auth.timezone,
          referenceTimeIso:
            input.auth.referenceTimeIso,
          openAiConversationId
        });

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId:
          delegation.id,
        phase:
          "EXECUTIVE_TURN",
        status:
          "COMPLETE",
        direction:
          "internal"
      });

      try {
        await persistLiveSessionExecutiveConversationId({
          bindingId:
            input.binding.id,
          executiveConversationId:
            result.openAiConversationId
        });
      } catch {
        recordLiveLifecycle({
          bindingId:
            input.binding.id,
          openAiSessionId:
            input.binding
              .openAiSessionId ??
            undefined,
          delegationId:
            delegation.id,
          phase:
            "EXECUTIVE_TURN",
          status:
            "CONVERSATION_BINDING_PERSIST_FAILED",
          direction:
            "internal"
        });
      }

      await deliverTurnResult(
        delegation.id,
        result.capabilityResults
      );

      sendCommentary(
        delegation.id,
        result.finalOutput
      );
    } catch (error) {
      // Never persist the caught error's message: it originates from
      // Sol's own turn (which may reference business/customer data, e.g.
      // "Customer not found: <name>"). Only a sanitized, class-based
      // classification is diagnostic-safe — see
      // classifyExecutiveTurnFailure's own doc comment for exactly what
      // it does and does not read from the error.
      //
      // Critically, this catch is scoped to exactly this one
      // delegation_id. The sideband connection, the transcript buffer,
      // and every other delegation_id are entirely unaffected — there is
      // no shared correlation state here for one failed turn to poison,
      // unlike the retired Responses-delegation protocol's response-scoped
      // maps. The very next session.delegation.created on this same
      // session runs independently and normally.
      const classification =
        classifyExecutiveTurnFailure(error);

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId:
          delegation.id,
        phase:
          "EXECUTIVE_TURN",
        status:
          "FAILED",
        direction:
          "internal",
        errorClass:
          classification.errorClass,
        errorType:
          classification.errorType,
        errorCode:
          classification.errorCode,
        errorStatus:
          classification.errorStatus,
        errorCategory:
          classification.errorCategory
      });

      sendCommentary(
        delegation.id,
        GRACEFUL_EXECUTIVE_FAILURE_REPLY
      );
    }
  }

  async function handle(
    envelope: unknown
  ): Promise<void> {
    if (!isRecord(envelope)) {
      return;
    }

    // Measurement only — see the identical rationale in the retired
    // protocol's handler for why this trace exists and stays this
    // narrow.
    if (
      envelope.type ===
      "session.closed"
    ) {
      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        eventId:
          readString(
            envelope,
            "event_id"
          ),
        clientEventId:
          readString(
            envelope,
            "client_event_id"
          ),
        phase:
          "SIDEBAND_MESSAGE",
        status:
          `SESSION_CLOSED:${
            readString(
              envelope,
              "reason"
            ) ?? "unknown"
          }`,
        direction:
          "inbound"
      });

      return;
    }

    if (
      envelope.type ===
      "session.input_transcript.delta"
    ) {
      const delta =
        readString(
          envelope,
          "delta"
        );

      if (delta) {
        pendingTranscript += delta;
      }

      return;
    }

    if (
      envelope.type !==
      "session.delegation.created"
    ) {
      return;
    }

    const delegation =
      envelope.delegation;

    if (!isRecord(delegation)) {
      return;
    }

    const id =
      readString(
        delegation,
        "id"
      );

    const target =
      readString(
        delegation,
        "target"
      );

    if (!id || !target) {
      return;
    }

    await handleDelegationCreated({
      id,
      target
    });
  }

  return {
    handle
  };
}
