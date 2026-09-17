import { db } from "../db";

export type LiveLifecycleDirection =
  | "inbound"
  | "outbound"
  | "internal";

export type LiveLifecycleEvent = {
  bindingId: string;
  openAiSessionId?: string;
  delegationId?: string;
  responseId?: string;
  callId?: string;
  toolName?: string;
  eventId?: string;
  clientEventId?: string;
  outboundEventId?: string;
  errorType?: string;
  errorCode?: string;
  errorParam?: string;
  errorMessage?: string;
  // Payload-free identity of the raw error wrapped by the SDK's
  // WebSocketError.cause for a non-protocol (transport) failure — a Node
  // error's own classification fields, never a request/response body.
  errorCauseName?: string;
  errorCauseMessage?: string;
  errorCauseCode?: string;
  errorCauseErrno?: string;
  errorCauseSyscall?: string;
  // RFC 6455 WebSocket close code/reason and a readyState snapshot.
  closeCode?: number;
  closeReason?: string;
  socketReadyState?: number;
  // Sanitized, class-based failure classification for a failed backend
  // Executive turn — see classifyExecutiveTurnFailure in
  // live-delegation-bridge.ts. Never an exception message.
  errorClass?: string;
  errorStatus?: number;
  errorCategory?: string;
  phase: string;
  status: string;
  direction: LiveLifecycleDirection;
  timestamp?: string;
};

// Test-support only: recordLiveLifecycle is fire-and-forget by design (a
// diagnostics write must never make the caller wait), so there is
// otherwise no way for a test to know a persist has landed without an
// arbitrary sleep. Production code never reads this.
const pendingPersists =
  new Set<Promise<unknown>>();

export async function flushPendingLiveDiagnosticWrites(): Promise<void> {
  await Promise.allSettled(
    Array.from(pendingPersists)
  );
}

// Process-local monotonic counter, assigned synchronously at call time —
// independent of createdAt's millisecond resolution and of this row's
// own fire-and-forget (unordered-completion) DB write, so same-millisecond
// events still have a provably strict total order. Test-support access
// only via resetLiveDiagnosticSequenceForTests below; production code
// never reads it.
let sequenceCounter = 0;

export function resetLiveDiagnosticSequenceForTests(): void {
  sequenceCounter = 0;
}

function optionalIdentifier(
  value: string | undefined
): string | undefined {
  const normalized =
    value?.trim();

  return normalized
    ? normalized
    : undefined;
}

/**
 * Durably persists one Live lifecycle event to LiveDiagnosticEvent —
 * append-only, tenant/session-scoped protocol-correlation evidence that
 * survives the server process (unlike the console.info line below, which
 * previously was this function's only output and vanished the moment the
 * dev-server process handling a session exited). Fire-and-forget and
 * failure-swallowing by design: a diagnostics-write failure must never
 * affect the Live sideband protocol handling that this function is
 * called from the middle of. Never persists tool arguments, business
 * results, or transcript/audio content — only protocol identifiers and
 * OpenAI's own server-originated error fields, exactly what was already
 * being passed into this function.
 */
function persistLiveLifecycle(
  event: LiveLifecycleEvent,
  timestamp: string,
  sequence: number
): void {
  const write = db.liveDiagnosticEvent
    .create({
      data: {
        bindingId: event.bindingId,
        sequence,
        direction: event.direction,
        phase: event.phase,
        status: event.status,
        openAiSessionId:
          optionalIdentifier(event.openAiSessionId),
        delegationId:
          optionalIdentifier(event.delegationId),
        responseId:
          optionalIdentifier(event.responseId),
        callId:
          optionalIdentifier(event.callId),
        toolName:
          optionalIdentifier(event.toolName),
        eventId:
          optionalIdentifier(event.eventId),
        clientEventId:
          optionalIdentifier(event.clientEventId),
        outboundEventId:
          optionalIdentifier(event.outboundEventId),
        errorType:
          optionalIdentifier(event.errorType),
        errorCode:
          optionalIdentifier(event.errorCode),
        errorParam:
          optionalIdentifier(event.errorParam),
        errorMessage:
          optionalIdentifier(event.errorMessage),
        errorCauseName:
          optionalIdentifier(event.errorCauseName),
        errorCauseMessage:
          optionalIdentifier(event.errorCauseMessage),
        errorCauseCode:
          optionalIdentifier(event.errorCauseCode),
        errorCauseErrno:
          optionalIdentifier(event.errorCauseErrno),
        errorCauseSyscall:
          optionalIdentifier(event.errorCauseSyscall),
        closeCode: event.closeCode ?? null,
        closeReason:
          optionalIdentifier(event.closeReason),
        socketReadyState: event.socketReadyState ?? null,
        errorClass:
          optionalIdentifier(event.errorClass),
        errorStatus: event.errorStatus ?? null,
        errorCategory:
          optionalIdentifier(event.errorCategory),
        createdAt: new Date(timestamp)
      }
    })
    .catch(() => {
      // Best-effort only — see doc comment above.
    });

  pendingPersists.add(write);
  void write.finally(() => {
    pendingPersists.delete(write);
  });
}

export function recordLiveLifecycle(
  event: LiveLifecycleEvent
): void {
  const timestamp =
    event.timestamp ??
    new Date().toISOString();

  const sequence =
    ++sequenceCounter;

  console.info(
    "METRIX_LIVE_LIFECYCLE",
    {
      sequence,
      bindingId:
        event.bindingId,
      openAiSessionId:
        optionalIdentifier(
          event.openAiSessionId
        ),
      delegationId:
        optionalIdentifier(
          event.delegationId
        ),
      responseId:
        optionalIdentifier(
          event.responseId
        ),
      callId:
        optionalIdentifier(
          event.callId
        ),
      toolName:
        optionalIdentifier(event.toolName),
      eventId:
        optionalIdentifier(event.eventId),
      clientEventId:
        optionalIdentifier(event.clientEventId),
      outboundEventId:
        optionalIdentifier(event.outboundEventId),
      errorType:
        optionalIdentifier(event.errorType),
      errorCode:
        optionalIdentifier(event.errorCode),
      errorParam:
        optionalIdentifier(event.errorParam),
      // OpenAI's server validation message is needed to identify the
      // rejected protocol command. This field is server-originated and is
      // never populated from transcript/audio/tool arguments.
      errorMessage:
        optionalIdentifier(event.errorMessage),
      errorCauseName:
        optionalIdentifier(event.errorCauseName),
      errorCauseMessage:
        optionalIdentifier(event.errorCauseMessage),
      errorCauseCode:
        optionalIdentifier(event.errorCauseCode),
      errorCauseErrno:
        optionalIdentifier(event.errorCauseErrno),
      errorCauseSyscall:
        optionalIdentifier(event.errorCauseSyscall),
      closeCode: event.closeCode,
      closeReason:
        optionalIdentifier(event.closeReason),
      socketReadyState: event.socketReadyState,
      errorClass:
        optionalIdentifier(event.errorClass),
      errorStatus: event.errorStatus,
      errorCategory:
        optionalIdentifier(event.errorCategory),
      phase:
        event.phase,
      status:
        event.status,
      direction:
        event.direction,
      timestamp
    }
  );

  persistLiveLifecycle(event, timestamp, sequence);
}
