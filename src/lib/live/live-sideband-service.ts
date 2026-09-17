import {
  markLiveSessionDisconnected,
  markLiveSessionFailed
} from "./live-session-store";
import { markLiveSidebandAttached } from "./live-session-store";
import OpenAI from "openai";

import {
  SidebandWS
} from "openai/resources/live/sideband/ws";

import type {
  AuthenticatedExecutiveContext
} from "../auth/executive-session-context";

import {
  recordLiveLifecycle
} from "./live-observability";

import {
  createLiveDelegationBridge
} from "./live-delegation-bridge";

import type {
  LiveSessionBinding
} from "./types";

type UnknownRecord =
  Record<string, unknown>;

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
      },
      // Native SDK reconnection for recoverable close codes — the actual
      // fix for a transient sideband transport blip (a real, observed
      // occurrence; OpenAI's own SessionClosedEvent.reason enumerates
      // "connection_lost" as an expected, recoverable condition) ending
      // an entire Live session's ability to take further turns. Without
      // this option the SDK does not attempt reconnection at all — every
      // "error" was previously treated as immediately terminal by this
      // file's own handler below, not by anything the SDK required.
      {
        reconnect: {
          onReconnecting(event) {
            recordLiveLifecycle({
              bindingId:
                input.binding.id,
              openAiSessionId,
              phase:
                "SIDEBAND",
              status:
                `RECONNECTING:${event.attempt}`,
              direction:
                "internal"
            });
          }
        }
      }
    );

  // Set on "error", cleared on a confirmed "reconnected" — the durable
  // signal read only once, by "close" (see below), to decide whether the
  // session's business state should end as FAILED. Never mutated from
  // "error" itself: with reconnection enabled, "close" only fires once
  // the SDK is genuinely and permanently done (retries exhausted or a
  // non-recoverable close code), so a transient error the SDK goes on to
  // recover from must never have already wiped the session's delivered
  // Workspace state.
  let unrecoveredTransportError = false;
  let readinessSettled = false;

  // Set inside the "error" listener below, read immediately after each
  // sideband.send() call by the wrapped `send` passed to
  // createLiveDelegationBridge. Reliable because the SDK's own
  // EventEmitter dispatches listeners synchronously (a plain for-loop,
  // no microtask — confirmed against the installed SDK's
  // core/EventEmitter.ts), and send()'s own not-OPEN guard / try-catch
  // both funnel into _onError -> this same synchronous "error" emit
  // before send() ever returns to its caller.
  let lastSendSynchronousError = false;

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
      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId,
        phase:
          "SIDEBAND",
        status:
          "OPEN",
        direction:
          "inbound"
      });

      void markLiveSidebandAttached({
        bindingId:
          input.binding.id
      })
        .then(
          () => {
            recordLiveLifecycle({
              bindingId:
                input.binding.id,
              openAiSessionId,
              phase:
                "SIDEBAND",
              status:
                "READY",
              direction:
                "internal"
            });

            resolveReadiness();
          }
        )
        .catch(
          () => {
            unrecoveredTransportError =
              true;

            recordLiveLifecycle({
              bindingId:
                input.binding.id,
              openAiSessionId,
              phase:
                "SIDEBAND",
              status:
                "ATTACH_PERSIST_FAILED",
              direction:
                "internal"
            });

            rejectReadiness(
              "Live sideband attachment persistence failed"
            );

            sideband.close();
          }
        );
    }
  )

  const protocol =
    createLiveDelegationBridge({
      binding:
        input.binding,
      auth:
        input.auth,
      send(event) {
        lastSendSynchronousError =
          false;

        sideband.send(event);

        return !lastSendSynchronousError;
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
              "FAILED",
            direction:
              "internal"
          });

          sideband.close();
        });
    }
  );



sideband.on(
    "reconnected",
    () => {
      unrecoveredTransportError =
        false;

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId,
        phase:
          "SIDEBAND",
        status:
          "RECONNECTED",
        direction:
          "inbound"
      });
    }
  )

sideband.on(
    "error",
    (error: unknown) => {
      unrecoveredTransportError =
        true;

      lastSendSynchronousError =
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
          "ERROR",
        direction:
          "inbound"
      });

      // Dev-only, payload-free diagnostic: distinguishes a real OpenAI
      // Live protocol error (a command the server rejected — code/type/
      // client_event_id) from a local transport error (socket/send
      // failure). The installed SDK's WebSocketError never carries
      // transcript/audio/credential/SDP content in .message or .cause —
      // confirmed against node_modules/openai/src/resources/live/
      // sideband/internal-base.ts's WebSocketError/_onError: for a
      // transport failure, .message is always one of this SDK's own
      // fixed diagnostic strings ("cannot send on a closed WebSocket",
      // "could not send data", a WebSocket reconnect-exhaustion message)
      // or a raw Node network error's message (e.g. "read ECONNRESET"),
      // and .cause is that same raw Node error, never request content.
      if (process.env.NODE_ENV !== "production") {
        const errorRecord =
          isRecord(error) ? error : undefined;

        const protocolErrorEvent =
          errorRecord &&
          isRecord(errorRecord.error)
            ? errorRecord.error
            : undefined;

        const protocolError =
          protocolErrorEvent &&
          isRecord(protocolErrorEvent.error)
            ? protocolErrorEvent.error
            : undefined;

        const errorClassName =
          errorRecord &&
          typeof errorRecord.name ===
            "string"
            ? errorRecord.name
            : "unknown";

        const kind = protocolError
          ? "PROTOCOL"
          : "TRANSPORT";

        // Only populated for TRANSPORT: the SDK's own WebSocketError
        // .message (see comment above) and the raw Node error it wraps
        // as .cause (set via WebSocketError.cause = cause in
        // internal-base.ts's _onError — a plain own-property, not a
        // getter). readyState is read synchronously at the moment this
        // handler runs, from the same NodeWebSocket the send() calls
        // below check against.
        const transportMessage =
          !protocolError &&
          errorRecord &&
          typeof errorRecord.message ===
            "string"
            ? errorRecord.message
            : undefined;

        const cause =
          !protocolError &&
          errorRecord &&
          isRecord(errorRecord.cause)
            ? errorRecord.cause
            : undefined;

        const causeName =
          cause &&
          typeof cause.name ===
            "string"
            ? cause.name
            : undefined;

        const causeMessage =
          cause &&
          typeof cause.message ===
            "string"
            ? cause.message
            : undefined;

        const causeCode =
          cause &&
          typeof cause.code ===
            "string"
            ? cause.code
            : undefined;

        const causeErrno =
          cause &&
          (typeof cause.errno ===
            "number" ||
            typeof cause.errno ===
              "string")
            ? String(cause.errno)
            : undefined;

        const causeSyscall =
          cause &&
          typeof cause.syscall ===
            "string"
            ? cause.syscall
            : undefined;

        const socketReadyState =
          typeof sideband.socket
            ?.readyState ===
          "number"
            ? sideband.socket
                .readyState
            : undefined;

        const protocolType =
          protocolError
            ? readString(
                protocolError,
                "type"
              )
            : undefined;

        const protocolCode =
          protocolError
            ? readString(
                protocolError,
                "code"
              )
            : undefined;

        const clientEventId =
          (protocolError
            ? readString(
                protocolError,
                "client_event_id"
              )
            : undefined) ??
          (protocolErrorEvent
            ? readString(
                protocolErrorEvent,
                "client_event_id"
              )
            : undefined);

        const serverEventId =
          protocolErrorEvent
            ? readString(protocolErrorEvent, "event_id")
            : undefined;

        const protocolParam =
          protocolError
            ? readString(protocolError, "param")
            : undefined;

        const protocolMessage =
          protocolError
            ? readString(protocolError, "message")
            : undefined;

        recordLiveLifecycle({
          bindingId:
            input.binding.id,
          openAiSessionId,
          eventId: serverEventId,
          clientEventId,
          errorType: protocolType,
          errorCode: protocolCode,
          errorParam: protocolParam,
          errorMessage:
            protocolMessage ??
            transportMessage,
          errorCauseName: causeName,
          errorCauseMessage:
            causeMessage,
          errorCauseCode: causeCode,
          errorCauseErrno: causeErrno,
          errorCauseSyscall:
            causeSyscall,
          socketReadyState:
            socketReadyState,
          phase:
            "SIDEBAND",
          status:
            [
              "ERROR_DETAIL",
              kind,
              errorClassName,
              protocolType ??
                "-",
              protocolCode ??
                "-"
            ].join(":"),
          direction:
            "inbound"
        });
      }

      // Deliberately NOT calling markLiveSessionFailed here anymore. With
      // native reconnection enabled above, "close" only fires once the
      // SDK is genuinely and permanently done with this connection — an
      // "error" that the SDK goes on to recover from (a "reconnected"
      // event) must never have already ended the session's business
      // state or wiped an already-delivered Workspace directive.
    }
  )

  sideband.on(
    "close",
    (
      code: unknown,
      reason: unknown
    ) => {
      // Never previously captured, even though the SDK always supplies
      // both (WebSocketEvents.close: (code, reason, unsent) => void) —
      // this is the RFC 6455 close code/reason, not business data, and
      // is exactly what decides isRecoverableClose() inside the installed
      // SDK (node_modules/openai/src/internal/ws.ts).
      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId,
        closeCode:
          typeof code ===
          "number"
            ? code
            : undefined,
        closeReason:
          typeof reason ===
          "string"
            ? reason
            : undefined,
        socketReadyState:
          typeof sideband.socket
            ?.readyState ===
          "number"
            ? sideband.socket
                .readyState
            : undefined,
        phase:
          "SIDEBAND",
        status:
          "CLOSED",
        direction:
          "inbound"
      });

      if (!readinessSettled) {
        rejectReadiness(
          "Live sideband closed before readiness"
        );
      }

      // "close" is the single point that decides FAILED vs DISCONNECTED:
      // it only fires once the SDK is permanently done (reconnection, if
      // any was in progress, has already been exhausted), so whichever
      // state unrecoveredTransportError last landed in — cleared by a
      // "reconnected" in between, or still set from an error that was
      // never recovered — is the correct, final answer. Logged as its own
      // diagnostic event (not only as the LiveSession row's status/
      // failureCode) so a single LiveDiagnosticEvent query reconstructs
      // this decision in place, in the same chronological timeline as
      // every other lifecycle event for the binding.
      if (unrecoveredTransportError) {
        recordLiveLifecycle({
          bindingId:
            input.binding.id,
          openAiSessionId,
          phase:
            "SESSION",
          status:
            "MARKED_FAILED:LIVE_SIDEBAND_FAILED",
          direction:
            "internal"
        });

        void markLiveSessionFailed({
          bindingId:
            input.binding.id,
          failureCode:
            "LIVE_SIDEBAND_FAILED"
        });

        return;
      }

      recordLiveLifecycle({
        bindingId:
          input.binding.id,
        openAiSessionId,
        phase:
          "SESSION",
        status:
          "MARKED_DISCONNECTED",
        direction:
          "internal"
      });

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
      "ATTACHING",
    direction:
      "internal"
  });

  return {
    ready,
    close(options) {
      if (options?.failed) {
        unrecoveredTransportError =
          true;
      }

      sideband.close();
    }
  };
}
