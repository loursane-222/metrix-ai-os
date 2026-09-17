import {
  ExecutiveAuthenticationError,
  resolveAuthenticatedExecutiveContext
} from "../../../../../../../lib/auth/executive-session-context";

import {
  LiveSessionAccessDeniedError,
  loadLiveSessionTurnResultState
} from "../../../../../../../lib/live/live-session-store";

import type {
  LiveSessionTurnResultState
} from "../../../../../../../lib/live/live-session-store";

function jsonNoStore(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

function sseEvent(state: LiveSessionTurnResultState): Uint8Array {
  const payload = JSON.stringify({
    ok: true,
    version: state.version,
    turnResult: state.turnResult
  });

  return new TextEncoder().encode(`data: ${payload}\n\n`);
}

const HEARTBEAT = new TextEncoder().encode(": keepalive\n\n");

// How often this stream re-reads the durable LiveSession row and compares
// its version against the last one this connection sent. This interval —
// not any in-process notification — is what makes delivery correct: it
// is proven (see live-session-store.ts's publishLiveSessionTurnResult doc
// comment) that a "publisher" and "this route" can end up holding two
// entirely different instances of what looks like the same in-process
// singleton under Next.js's dev module bundler, silently, with no error,
// and that divergence can even appear mid-connection as routes get
// recompiled. Re-reading the durable row on a timer has no such failure
// mode — it needs nothing to have been received from another module,
// only that the database write already happened, which it always has by
// the time deliverTurnResult's caller returns.
const RECONCILE_INTERVAL_MS = 1_000;

/**
 * Read-only, authenticated delivery of the current and future canonical
 * TurnResult for one Live voice session binding — the generic transport
 * half of the Voice -> UI bridge, carrying the exact same
 * CanonicalCapabilityResult/TurnResult/presentation shape the text
 * /api/metrix turn endpoint returns. Carries no business decision: every
 * result was already produced by the shared canonical dispatcher and
 * projection (canonicalResultForToolCall / projectCapabilityResults), and
 * durably persisted before this route or any other code path can see it.
 * Server-Sent Events is only the wire format; the correctness mechanism
 * underneath is a plain re-read of that durable row on a short timer,
 * deduped by version — the same row a reconnecting client's very first
 * read recovers from, with no dependency on any event this connection
 * may or may not have missed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bindingId: string }> }
) {
  let auth;
  let bindingId: string;

  try {
    auth = await resolveAuthenticatedExecutiveContext(request);
    ({ bindingId } = await params);

    // Fails closed here (access-denied / not-found) before opening the
    // stream — an SSE response cannot change its status code once
    // streaming has started.
    await loadLiveSessionTurnResultState({
      bindingId,
      actorUserId: auth.actorUserId,
      organizationId: auth.organizationId
    });
  } catch (error) {
    if (error instanceof ExecutiveAuthenticationError) {
      return jsonNoStore({ ok: false, code: error.code }, error.status);
    }

    if (error instanceof LiveSessionAccessDeniedError) {
      return jsonNoStore({ ok: false, code: error.code }, 404);
    }

    throw error;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      // -1, never a real version, so the very first reconcile always
      // sends — a reconnecting client recovers the latest durable state
      // as its first event, exactly like a brand-new connection does.
      let lastSentVersion = -1;

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(reconcile);

        try {
          controller.close();
        } catch {
          // Already closed by the browser disconnecting first.
        }
      };

      const reconcileOnce = async () => {
        if (closed) {
          return;
        }

        let state: LiveSessionTurnResultState;

        try {
          state = await loadLiveSessionTurnResultState({
            bindingId,
            actorUserId: auth.actorUserId,
            organizationId: auth.organizationId
          });
        } catch {
          close();
          return;
        }

        if (closed) {
          return;
        }

        try {
          if (state.version !== lastSentVersion) {
            lastSentVersion = state.version;
            controller.enqueue(sseEvent(state));
          } else {
            controller.enqueue(HEARTBEAT);
          }
        } catch {
          close();
        }
      };

      void reconcileOnce();

      const reconcile = setInterval(
        () => {
          void reconcileOnce();
        },
        RECONCILE_INTERVAL_MS
      );

      request.signal.addEventListener("abort", close);
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive"
    }
  });
}
