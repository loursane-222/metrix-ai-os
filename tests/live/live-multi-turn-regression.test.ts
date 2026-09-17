import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import type {
  AuthenticatedExecutiveContext
} from "../../src/lib/auth/executive-session-context";

import type {
  LiveSessionBinding
} from "../../src/lib/live/types";

import type {
  MetrixExecutiveTurnResult
} from "../../src/lib/agent/types";

// Regression harness for the shared Live business lifecycle: proves that
// N sequential business turns on ONE physical Live session (one
// createLiveDelegationBridge instance, exactly like one attachLiveSideband
// call spanning a whole call) each independently reach the single backend
// Executive and publish their own TurnResult version — the same
// invariant the original reality-gate physical repro protected, now
// under client delegation. Sol (runMetrixExecutiveTurn) is mocked here
// for the same reason live-delegation-bridge.test.ts mocks it: this file
// proves the bridge's own multi-turn plumbing, not Sol's native
// tool-selection (covered elsewhere, unmocked).

const mocks =
  vi.hoisted(() => ({
    runMetrixExecutiveTurn: vi.fn(),
    recordLiveLifecycle: vi.fn(),
    publishLiveSessionTurnResult: vi.fn(),
    loadLiveSessionExecutiveConversationId: vi.fn(),
    persistLiveSessionExecutiveConversationId: vi.fn(),
    sent: [] as unknown[],
    turnResultVersion: 0
  }));

vi.mock(
  "../../src/lib/agent/metrix-executive-agent",
  async () => {
    const actual = await vi.importActual<
      typeof import("../../src/lib/agent/metrix-executive-agent")
    >("../../src/lib/agent/metrix-executive-agent");

    return {
      ...actual,
      runMetrixExecutiveTurn: mocks.runMetrixExecutiveTurn
    };
  }
);

vi.mock(
  "../../src/lib/live/live-observability",
  () => ({ recordLiveLifecycle: mocks.recordLiveLifecycle })
);

// This file tests bridge/multi-turn plumbing in isolation — deliberately
// not the real DB write path (that end-to-end persistence guarantee is
// separately covered, unmocked, by live-result-delivery-decoupling.test.ts
// / live-result-delivery.test.ts). A deterministic in-memory version
// counter stands in for the durable LiveSession row's turnResultVersion
// increment.
vi.mock(
  "../../src/lib/live/live-session-store",
  async () => {
    const actual = await vi.importActual<
      typeof import("../../src/lib/live/live-session-store")
    >("../../src/lib/live/live-session-store");

    return {
      ...actual,
      publishLiveSessionTurnResult: mocks.publishLiveSessionTurnResult,
      loadLiveSessionExecutiveConversationId:
        mocks.loadLiveSessionExecutiveConversationId,
      persistLiveSessionExecutiveConversationId:
        mocks.persistLiveSessionExecutiveConversationId
    };
  }
);

const binding: LiveSessionBinding = {
  id: "binding_multi_turn",
  openAiSessionId: "live_session_multi_turn",
  userId: "user_1",
  organizationId: "org_1",
  status: "CONNECTED",
  createdAt: new Date("2026-09-17T00:00:00.000Z"),
  connectedAt: new Date("2026-09-17T00:00:01.000Z"),
  sidebandAttachedAt: null,
  endedAt: null,
  failureCode: null
};

const auth: AuthenticatedExecutiveContext = {
  actorUserId: "user_1",
  organizationId: "org_1",
  timezone: "Europe/Istanbul",
  referenceTimeIso: "2026-09-17T00:00:00.000Z"
};

function executiveTurnResult(
  overrides: Partial<MetrixExecutiveTurnResult>
): MetrixExecutiveTurnResult {
  return {
    finalOutput: "Tamamlandı.",
    executionItems: [],
    toolCalls: [],
    capabilityResults: [],
    openAiConversationId: "conv_multi_turn",
    ...overrides
  };
}

async function speak(
  bridge: {
    handle(envelope: unknown): Promise<void>;
  },
  text: string
): Promise<void> {
  await bridge.handle({
    type: "session.input_transcript.delta",
    delta: text
  });
}

async function delegate(
  bridge: {
    handle(envelope: unknown): Promise<void>;
  },
  delegationId: string
): Promise<void> {
  await bridge.handle({
    type: "session.delegation.created",
    delegation: {
      id: delegationId,
      target: "client",
      type: "delegation"
    }
  });
}

function commentarySends(): unknown[] {
  return mocks.sent.filter(
    (event: any) => event?.type === "session.commentary.append"
  );
}

describe(
  "shared Live business lifecycle — unlimited sequential business turns on one physical session",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.sent.length = 0;
      mocks.turnResultVersion = 0;

      mocks.loadLiveSessionExecutiveConversationId
        .mockResolvedValue(undefined);

      mocks.publishLiveSessionTurnResult.mockImplementation(
        async () => ({
          version: ++mocks.turnResultVersion
        })
      );
    });

    it(
      "runs two full business turns (delegation -> single backend Executive -> publish -> commentary) back to back on the same bridge instance",
      async () => {
        mocks.runMetrixExecutiveTurn
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Müşterilerinizi listeledim.",
              capabilityResults: [
                {
                  capability: "customer_lookup",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, customers: [] }
                }
              ]
            })
          )
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Görevlerinizi listeledim.",
              capabilityResults: [
                {
                  capability: "task_list",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, tasks: [] }
                }
              ]
            })
          );

        const { createLiveDelegationBridge } = await import(
          "../../src/lib/live/live-delegation-bridge"
        );

        const bridge = createLiveDelegationBridge({
          binding,
          auth,
          send(event: unknown) {
            mocks.sent.push(event);
            return true;
          }
        });

        // Turn 1 — "Müşterilerimi göster."
        await speak(bridge, "Müşterilerimi göster");
        await delegate(bridge, "delegation_1");

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(1);
        expect(mocks.runMetrixExecutiveTurn).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            turnId: "delegation_1",
            message: "Müşterilerimi göster"
          })
        );

        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "RESULT_DELIVERY",
            status: "PUBLISHED:1"
          })
        );

        // Turn 2 — "Görevlerimi göster." — a brand new delegation, same
        // bridge instance (same physical Live session), nothing reset in
        // between. This is exactly the boundary the physical repro found
        // dead for the retired protocol; it applies just as directly here.
        await speak(bridge, "Görevlerimi göster");
        await delegate(bridge, "delegation_2");

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(2);
        expect(mocks.runMetrixExecutiveTurn).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            turnId: "delegation_2",
            message: "Görevlerimi göster"
          })
        );

        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "RESULT_DELIVERY",
            status: "PUBLISHED:2"
          })
        );

        // No cross-talk: turn 2's call must never have carried turn 1's
        // reconstructed message.
        expect(mocks.runMetrixExecutiveTurn).not.toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            message: "Müşterilerimi göster"
          })
        );

        expect(commentarySends()).toHaveLength(2);
      }
    );

    it(
      "runs 8 consecutive synthetic business turns without duplicate execution, version drift, or cross-turn correlation leaks",
      async () => {
        const TURN_COUNT = 8;

        mocks.runMetrixExecutiveTurn.mockImplementation(
          async (call: any) =>
            executiveTurnResult({
              finalOutput: `Turn for ${call.turnId} complete.`,
              capabilityResults: [
                {
                  capability:
                    call.message.includes("task")
                      ? "task_list"
                      : "customer_lookup",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, items: [] }
                }
              ]
            })
        );

        const { createLiveDelegationBridge } = await import(
          "../../src/lib/live/live-delegation-bridge"
        );

        const bridge = createLiveDelegationBridge({
          binding,
          auth,
          send(event: unknown) {
            mocks.sent.push(event);
            return true;
          }
        });

        for (let turn = 1; turn <= TURN_COUNT; turn++) {
          const delegationId = `delegation_${turn}`;
          const userSpeech =
            turn % 2 === 0
              ? `task turn ${turn}`
              : `customer turn ${turn}`;

          await speak(bridge, userSpeech);
          await delegate(bridge, delegationId);
        }

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(
          TURN_COUNT
        );

        for (let turn = 1; turn <= TURN_COUNT; turn++) {
          expect(
            mocks.runMetrixExecutiveTurn
          ).toHaveBeenNthCalledWith(
            turn,
            expect.objectContaining({
              turnId: `delegation_${turn}`
            })
          );
        }

        // Monotonic, non-duplicated, non-skipped version sequence.
        const publishedVersions = mocks.recordLiveLifecycle.mock.calls
          .map(([event]: any) => event)
          .filter(
            (event: any) =>
              event.phase === "RESULT_DELIVERY" &&
              typeof event.status === "string" &&
              event.status.startsWith("PUBLISHED:")
          )
          .map((event: any) => Number(event.status.split(":")[1]));

        expect(publishedVersions).toEqual(
          Array.from({ length: TURN_COUNT }, (_, i) => i + 1)
        );

        // Every delegation id across all 8 turns received its own,
        // distinct spoken reply — no collision even though the turns
        // share a numbering scheme.
        const delegationIdsReplied = commentarySends().map(
          (event: any) => event.delegation_id
        );
        expect(new Set(delegationIdsReplied).size).toBe(TURN_COUNT);
        expect(delegationIdsReplied).toHaveLength(TURN_COUNT);
      }
    );

    it(
      "a casual, tool-free turn between two business turns never publishes a TurnResult, and does not disrupt the next business turn",
      async () => {
        mocks.runMetrixExecutiveTurn
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Müşterilerinizi listeledim.",
              capabilityResults: [
                {
                  capability: "customer_lookup",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, customers: [] }
                }
              ]
            })
          )
          // Casual turn — "Beni duyuyor musun?" — Sol answers with no
          // tool call at all, so no capabilityResults come back.
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Evet, seni duyuyorum.",
              capabilityResults: []
            })
          )
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Görevlerinizi listeledim.",
              capabilityResults: [
                {
                  capability: "task_list",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, tasks: [] }
                }
              ]
            })
          );

        const { createLiveDelegationBridge } = await import(
          "../../src/lib/live/live-delegation-bridge"
        );

        const bridge = createLiveDelegationBridge({
          binding,
          auth,
          send(event: unknown) {
            mocks.sent.push(event);
            return true;
          }
        });

        // Business turn 1.
        await speak(bridge, "Müşterilerimi göster");
        await delegate(bridge, "delegation_a");

        // Casual turn.
        await speak(bridge, "Beni duyuyor musun?");
        await delegate(bridge, "delegation_b");

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(2);
        expect(
          mocks.recordLiveLifecycle.mock.calls.filter(
            ([event]: any) => event.phase === "RESULT_DELIVERY"
          )
        ).toHaveLength(1);

        // The casual turn still replies — the session stays responsive —
        // it just never reaches publish.
        expect(commentarySends()).toHaveLength(2);
        expect(commentarySends()[1]).toMatchObject({
          delegation_id: "delegation_b",
          content: "Evet, seni duyuyorum."
        });

        // Business turn 2 after the casual interlude still works.
        await speak(bridge, "Görevlerimi göster");
        await delegate(bridge, "delegation_c");

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(3);
        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "RESULT_DELIVERY",
            status: "PUBLISHED:2"
          })
        );
      }
    );

    it(
      "a commentary send() failure on turn 1 does not duplicate execution, does not lose the already-published TurnResult, and does not block turn 2",
      async () => {
        mocks.runMetrixExecutiveTurn
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Müşterilerinizi listeledim.",
              capabilityResults: [
                {
                  capability: "customer_lookup",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, customers: [] }
                }
              ]
            })
          )
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput: "Görevlerinizi listeledim.",
              capabilityResults: [
                {
                  capability: "task_list",
                  operation: "read",
                  data: { source: "COMPANY_REALITY", count: 0, tasks: [] }
                }
              ]
            })
          );

        // Turn 1's sideband send() reports failure (the SDK's own
        // contract — see DelegationBridgeSender's doc comment: a boolean,
        // not a throw). Canonical execution and TurnResult publication
        // happen before this boundary and are architecturally independent
        // of it (see deliverTurnResult's doc comment), which this asserts
        // directly rather than assuming.
        let sendShouldFail = true;

        const { createLiveDelegationBridge } = await import(
          "../../src/lib/live/live-delegation-bridge"
        );

        const bridge = createLiveDelegationBridge({
          binding,
          auth,
          send(event: unknown) {
            mocks.sent.push(event);
            return !sendShouldFail;
          }
        });

        await speak(bridge, "Müşterilerimi göster");
        await delegate(bridge, "delegation_1");

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(1);

        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "RESULT_DELIVERY",
            status: "PUBLISHED:1"
          })
        );

        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "COMMENTARY",
            status: "SEND_FAILED"
          })
        );

        // Transport recovers — turn 2 must still work, on the SAME
        // bridge instance, with no duplicate turn-1 execution.
        sendShouldFail = false;

        await speak(bridge, "Görevlerimi göster");
        await delegate(bridge, "delegation_2");

        expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(2);

        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "RESULT_DELIVERY",
            status: "PUBLISHED:2"
          })
        );

        expect(mocks.recordLiveLifecycle).toHaveBeenCalledWith(
          expect.objectContaining({
            phase: "COMMENTARY",
            status: "SUBMITTED",
            delegationId: "delegation_2"
          })
        );
      }
    );
  }
);
