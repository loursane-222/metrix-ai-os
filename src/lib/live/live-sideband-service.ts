import {
  markLiveSessionDisconnected,
  markLiveSessionFailed
} from "./live-session-store";
import { markLiveSidebandAttached } from "./live-session-store";
import OpenAI from "openai";

import {
  SidebandWS
} from "openai/resources/live/sideband/ws";
import type { ConnectClientEvent } from "openai/resources/live/sideband/sideband";

import type {
  AuthenticatedExecutiveContext
} from "../auth/executive-session-context";

import {
  METRIX_BUSINESS_TOOL_CONTRACTS,
  executeMetrixBusinessTool
} from "../agent/tools/metrix-business-tool-runtime";

import type {
  MetrixBusinessToolName
} from "../agent/tools/metrix-business-tool-runtime";

import {
  recordLiveLifecycle
} from "./live-observability";

import type {
  LiveSessionBinding
} from "./types";

type SidebandSender = {
  send(event: ConnectClientEvent): void;
};

type PendingCall = {
  responseId: string;
  callId: string;
  name: string;
  result: Promise<string>;
};

type UnknownRecord =
  Record<string, unknown>;

const KNOWN_TOOL_NAMES =
  new Set<string>(
    METRIX_BUSINESS_TOOL_CONTRACTS.map(
      contract =>
        contract.name
    )
  );

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
  const value =
    record[key];

  return (
    typeof value === "string" &&
    value.trim()
  )
    ? value
    : undefined;
}

function stableFailure(
  code: string
): string {
  return JSON.stringify({
    ok: false,
    code
  });
}

async function executeCall(
  input: {
    binding: LiveSessionBinding;
    auth:
      AuthenticatedExecutiveContext;
    callId: string;
    name: string;
    argumentsJson: string;
  }
): Promise<string> {
  if (
    !KNOWN_TOOL_NAMES.has(
      input.name
    )
  ) {
    return stableFailure(
      "UNKNOWN_TOOL"
    );
  }

  try {
    JSON.parse(
      input.argumentsJson
    );
  } catch {
    return stableFailure(
      "INVALID_TOOL_ARGUMENTS"
    );
  }

  try {
    const result =
      await executeMetrixBusinessTool({
        name:
          (input.name as MetrixBusinessToolName),
        argumentsJson:
          input.argumentsJson,
        context: {
          actorUserId:
            input.auth.actorUserId,
          organizationId:
            input.auth.organizationId,
          timezone:
            input.auth.timezone,
          referenceTimeIso:
            input.auth.referenceTimeIso,
          idempotencyScope:
            `live:${input.binding.id}:call:${input.callId}`
        }
      });

    return JSON.stringify({
      ok: true,
      result
    });
  } catch {
    return stableFailure(
      "TOOL_EXECUTION_FAILED"
    );
  }
}

function responseIdFromTerminalEvent(
  event: UnknownRecord
): string | undefined {
  const direct =
    readString(
      event,
      "response_id"
    );

  if (direct) {
    return direct;
  }

  const response =
    event.response;

  if (!isRecord(response)) {
    return undefined;
  }

  return readString(
    response,
    "id"
  );
}

export function createLiveSidebandProtocol(
  input: {
    binding: LiveSessionBinding;
    auth:
      AuthenticatedExecutiveContext;
    send:
      SidebandSender["send"];
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

  const callsById =
    new Map<
      string,
      PendingCall
    >();

  const flushedResponses =
    new Set<string>();

  const failedResponses =
    new Set<string>();

  async function handle(
    envelope: unknown
  ): Promise<void> {
    if (!isRecord(envelope)) {
      return;
    }

    if (
      envelope.type !==
      "response.event"
    ) {
      return;
    }

    const delegationId =
      readString(
        envelope,
        "delegation_id"
      );

    const nested =
      envelope.event;

    if (!isRecord(nested)) {
      return;
    }

    if (
      nested.type ===
        "response.failed"
    ) {
      const responseId =
        responseIdFromTerminalEvent(
          nested
        );

      if (responseId) {
        failedResponses.add(
          responseId
        );

        recordLiveLifecycle({
          bindingId:
            input.binding.id,
          openAiSessionId:
            input.binding
              .openAiSessionId ??
            undefined,
          delegationId,
          responseId,
          phase:
            "RESPONSE",
          status:
            "FAILED"
        });
      }

      return;
    }

    if (
      nested.type ===
      "response.output_item.done"
    ) {
      const responseId =
        readString(
          nested,
          "response_id"
        );

      const item =
        nested.item;

      if (
        responseId &&
        failedResponses.has(
          responseId
        )
      ) {
        return;
      }

      if (
        !responseId ||
        !isRecord(item) ||
        item.type !==
          "function_call"
      ) {
        return;
      }

      const callId =
        readString(
          item,
          "call_id"
        );

      const name =
        readString(
          item,
          "name"
        );

      const argumentsJson =
        readString(
          item,
          "arguments"
        );

      if (
        !callId ||
        !name ||
        argumentsJson ===
          undefined
      ) {
        return;
      }

      if (
        callsById.has(callId)
      ) {
        recordLiveLifecycle({
          bindingId:
            input.binding.id,
          openAiSessionId:
            input.binding
              .openAiSessionId ??
            undefined,
          delegationId,
          responseId,
          callId,
          phase:
            "FUNCTION_CALL",
          status:
            "DUPLICATE_IGNORED"
        });

        return;
      }

      const result =
        executeCall({
          binding:
            input.binding,
          auth:
            input.auth,
          callId,
          name,
          argumentsJson
        });

      callsById.set(
        callId,
        {
          responseId,
          callId,
          name,
          result
        }
      );

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId,
        responseId,
        callId,
        phase:
          "FUNCTION_CALL",
        status:
          "COLLECTED"
      });

      await result;

      return;
    }

    if (
      nested.type !==
      "response.completed"
    ) {
      return;
    }

    const responseId =
      responseIdFromTerminalEvent(
        nested
      );

    if (
      responseId &&
      failedResponses.has(
        responseId
      )
    ) {
      return;
    }

    if (
      !responseId ||
      flushedResponses.has(
        responseId
      )
    ) {
      return;
    }

    const pending =
      Array.from(
        callsById.values()
      ).filter(
        call =>
          call.responseId ===
          responseId
      );

    if (
      pending.length === 0
    ) {
      return;
    }

    const completed =
      await Promise.all(
        pending.map(
          async call => ({
            ...call,
            output:
              await call.result
          })
        )
      );

    for (
      const call
      of completed
    ) {
      input.send({
        type:
          "response.item.create",
        item: {
          type:
            "function_call_output",
          call_id:
            call.callId,
          output:
            call.output
        }
      });

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId:
          input.binding
            .openAiSessionId ??
          undefined,
        delegationId,
        responseId,
        callId:
          call.callId,
        phase:
          "FUNCTION_RESULT",
        status:
          "SUBMITTED"
      });
    }

    input.send({
      type:
        "response.create",});

    flushedResponses.add(
      responseId
    );

    recordLiveLifecycle({
      bindingId:
        input.binding.id,
      openAiSessionId:
        input.binding
          .openAiSessionId ??
        undefined,
      delegationId,
      responseId,
      phase:
        "RESPONSE_CONTINUATION",
      status:
        "SUBMITTED"
    });
  }

  return {
    handle
  };
}

export type LiveSidebandHandle = {
  ready: Promise<void>;
  close(options?: {
    failed?: boolean;
  }): void;
};

export function attachLiveSideband(
  input: {
    binding: LiveSessionBinding;
    auth:
      AuthenticatedExecutiveContext;
  }
): LiveSidebandHandle {
  const openAiSessionId =
    input.binding
      .openAiSessionId
      ?.trim();

  if (!openAiSessionId) {
    throw new Error(
      "Bound OpenAI Live session is required"
    );
  }

  const client =
    new OpenAI();

  const sideband =
    new SidebandWS(
      client,
      {
        session_id:
          openAiSessionId,
        graceful_close:
          true
      }
    );

  let terminalFailure = false;
  let readinessSettled = false;

  let resolveReady:
    (() => void) | undefined;

  let rejectReady:
    ((error: Error) => void) | undefined;

  const ready =
    new Promise<void>(
      (resolve, reject) => {
        resolveReady =
          resolve;

        rejectReady =
          reject;
      }
    );

  void ready.catch(
    () => undefined
  );

  function resolveReadiness() {
    if (readinessSettled) {
      return;
    }

    readinessSettled =
      true;

    resolveReady?.();
  }

  function rejectReadiness(
    message: string
  ) {
    if (readinessSettled) {
      return;
    }

    readinessSettled =
      true;

    rejectReady?.(
      new Error(
        message
      )
    );
  }


  sideband.socket.on(
    "open",
    () => {
      void markLiveSidebandAttached({
        bindingId:
          input.binding.id
      })
        .then(
          () => {
            resolveReadiness();
          }
        )
        .catch(
          () => {
            terminalFailure =
              true;

            rejectReadiness(
              "Live sideband attachment persistence failed"
            );

            sideband.close();
          }
        );
    }
  )

  const protocol =
    createLiveSidebandProtocol({
      binding:
        input.binding,
      auth:
        input.auth,
      send(event) {
        sideband.send(event);
      }
    });

  sideband.on(
    "event",
    event => {
      void protocol
        .handle(event)
        .catch(() => {
          recordLiveLifecycle({
            bindingId:
              input.binding.id,
            openAiSessionId,
            phase:
              "SIDEBAND_EVENT",
            status:
              "FAILED"
          });

          sideband.close();
        });
    }
  );



sideband.on(
    "error",
    () => {
      terminalFailure =
        true;

      rejectReadiness(
        "Live sideband failed before readiness"
      );

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId,
        phase:
          "SIDEBAND",
        status:
          "ERROR"
      });

      void markLiveSessionFailed({
        bindingId:
          input.binding.id,
        failureCode:
          "LIVE_SIDEBAND_FAILED"
      });
    }
  )

  sideband.on(
    "close",
    () => {
      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId,
        phase:
          "SIDEBAND",
        status:
          "CLOSED"
      });

      if (!readinessSettled) {
        rejectReadiness(
          "Live sideband closed before readiness"
        );
      }

      if (terminalFailure) {
        return;
      }

      void markLiveSessionDisconnected({
        bindingId:
          input.binding.id
      });
    }
  )

  recordLiveLifecycle({
    bindingId:
      input.binding.id,
    openAiSessionId,
    phase:
      "SIDEBAND",
    status:
      "ATTACHING"
  });

  return {
    ready,
    close(options) {
      if (options?.failed) {
        terminalFailure =
          true;
      }

      sideband.close();
    }
  };
}
