import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

describe(
  "safe Live observability",
  () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it(
      "records lifecycle metadata without sensitive payload fields",
      async () => {
        const info =
          vi
            .spyOn(
              console,
              "info"
            )
            .mockImplementation(
              () => undefined
            );

        const {
          recordLiveLifecycle
        } =
          await import(
            "../../src/lib/live/live-observability"
          );

        recordLiveLifecycle({
          bindingId:
            "binding_1",
          openAiSessionId:
            "live_session_1",
          delegationId:
            "delegation_1",
          responseId:
            "response_1",
          callId:
            "call_1",
          phase:
            "FUNCTION_CALL",
          status:
            "COMPLETED",
          direction:
            "inbound",
          timestamp:
            "2026-09-14T07:50:01.000Z"
        });

        expect(
          info
        ).toHaveBeenCalledTimes(1);

        const serialized =
          JSON.stringify(
            info.mock.calls
          );

        for (
          const forbidden
          of [
            "argumentsJson",
            "toolArguments",
            "toolResult",
            "transcript",
            "sdp",
            "OPENAI_API_KEY",
            "authorization",
            "cookie"
          ]
        ) {
          expect(
            serialized
          ).not.toContain(
            forbidden
          );
        }
      }
    );
  }
);

// Proves the actual gap the reality-gate report identified: console.info
// alone vanishes with the server process. This durable path must survive
// it, and a single ordered query against it must reconstruct a session's
// full chronological timeline — the exact operational requirement for a
// post-mortem after the next physical-mic run.
describe(
  "durable Live diagnostic evidence",
  () => {
    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId =
      `live-diag-org-${suffix}`;

    const userId =
      `live-diag-user-${suffix}`;

    const bindingId =
      `live-diag-binding-${suffix}`;

    afterAll(async () => {
      const { db } = await import("../../src/lib/db");

      await db.liveSession.deleteMany({
        where: { id: bindingId }
      });

      await db.user.deleteMany({
        where: { id: userId }
      });

      await db.organization.deleteMany({
        where: { id: organizationId }
      });

      await db.$disconnect();
    });

    it(
      "persists recordLiveLifecycle calls to LiveDiagnosticEvent and reconstructs the chronological timeline with one query",
      async () => {
        const { db } = await import("../../src/lib/db");

        await db.organization.create({
          data: { id: organizationId, name: "Live Diagnostics Tenant" }
        });

        await db.user.create({
          data: {
            id: userId,
            email: `${userId}@example.test`,
            name: "Live Diagnostics User"
          }
        });

        await db.liveSession.create({
          data: {
            id: bindingId,
            userId,
            organizationId,
            openAiSessionId: `openai-${suffix}`,
            status: "CONNECTED"
          }
        });

        const {
          recordLiveLifecycle,
          resetLiveDiagnosticSequenceForTests,
          flushPendingLiveDiagnosticWrites
        } = await import("../../src/lib/live/live-observability");

        resetLiveDiagnosticSequenceForTests();

        recordLiveLifecycle({
          bindingId,
          phase: "SIDEBAND",
          status: "ATTACHING",
          direction: "internal",
          timestamp: "2026-09-17T10:00:00.000Z"
        });

        recordLiveLifecycle({
          bindingId,
          responseId: "response_1",
          callId: "call_1",
          toolName: "task_list",
          outboundEventId: "metrix_tool_result_response_1_call_1",
          phase: "FUNCTION_RESULT",
          status: "SUBMITTED",
          direction: "outbound",
          timestamp: "2026-09-17T10:00:01.000Z"
        });

        recordLiveLifecycle({
          bindingId,
          eventId: "server_evt_1",
          clientEventId: "metrix_tool_result_response_1_call_1",
          errorType: "invalid_request_error",
          errorCode: "response_create_rejected",
          errorParam: "response.id",
          errorMessage: "test-fixture protocol rejection",
          phase: "SIDEBAND",
          status: "ERROR_DETAIL:PROTOCOL:Error:invalid_request_error:response_create_rejected",
          direction: "inbound",
          timestamp: "2026-09-17T10:00:02.000Z"
        });

        await flushPendingLiveDiagnosticWrites();

        const timeline =
          await db.liveDiagnosticEvent.findMany({
            where: { bindingId },
            orderBy: { createdAt: "asc" }
          });

        expect(timeline.map((row) => row.phase)).toEqual([
          "SIDEBAND",
          "FUNCTION_RESULT",
          "SIDEBAND"
        ]);

        // The monotonic sequence — not createdAt's millisecond
        // resolution — is the provably strict total order: assigned
        // synchronously at call time, independent of when each
        // fire-and-forget write actually lands.
        expect(timeline.map((row) => row.sequence)).toEqual([1, 2, 3]);

        const bySequence =
          await db.liveDiagnosticEvent.findMany({
            where: { bindingId },
            orderBy: { sequence: "asc" }
          });

        expect(bySequence.map((row) => row.phase)).toEqual(
          timeline.map((row) => row.phase)
        );

        expect(timeline[0]).toMatchObject({
          status: "ATTACHING",
          direction: "internal"
        });

        expect(timeline[1]).toMatchObject({
          toolName: "task_list",
          outboundEventId: "metrix_tool_result_response_1_call_1",
          direction: "outbound"
        });

        // The correlation invariant the reality gate requires: a server
        // error's client_event_id must be resolvable, in the same
        // session's timeline, against the outboundEventId this table
        // already recorded for the matching outbound command.
        expect(timeline[2].clientEventId).toBe(
          timeline[1].outboundEventId
        );

        expect(timeline[2]).toMatchObject({
          errorType: "invalid_request_error",
          errorCode: "response_create_rejected",
          errorParam: "response.id",
          errorMessage: "test-fixture protocol rejection",
          direction: "inbound"
        });

        // Terminal state transitions (markLiveSessionFailed etc.) must
        // never touch this table — it is independent of turnResultJson's
        // own clear-on-disconnect lifecycle.
        await db.liveSession.update({
          where: { id: bindingId },
          data: {
            status: "FAILED",
            failureCode: "LIVE_SIDEBAND_FAILED",
            endedAt: new Date(),
            turnResultJson: null
          }
        });

        const afterSessionEnd =
          await db.liveDiagnosticEvent.findMany({
            where: { bindingId }
          });

        expect(afterSessionEnd).toHaveLength(3);
      }
    );
  }
);
