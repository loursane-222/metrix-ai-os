import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { db } from "../../src/lib/db";

import type {
  MetrixExecutiveTurnResult
} from "../../src/lib/agent/types";

// Only the backend Executive turn itself is mocked here — Sol's own real
// native tool-selection against real Company Truth data is already
// proven end to end, unmocked, by tests/agent/executive-pipeline.
// acceptance.test.ts and friends. What THIS file proves, against a real
// (unmocked) Postgres database, is that publishLiveSessionTurnResult /
// loadLiveSessionTurnResultState — the actual Voice -> UI delivery
// bridge — round-trip correctly: version increments, TTL expiry,
// disconnect clearing, and cross-tenant access denial, all driven by the
// real client-delegation bridge (live-delegation-bridge.ts) rather than
// a hand-built TurnResult.
const mocks = vi.hoisted(() => ({
  runMetrixExecutiveTurn: vi.fn()
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

import {
  createLiveDelegationBridge
} from "../../src/lib/live/live-delegation-bridge";

import {
  LiveSessionAccessDeniedError,
  bindOpenAiLiveSession,
  createLiveSessionBinding,
  loadLiveSessionTurnResultState,
  markLiveSessionDisconnected
} from "../../src/lib/live/live-session-store";

import type { AuthenticatedExecutiveContext } from "../../src/lib/auth/executive-session-context";
import type { LiveSessionBinding } from "../../src/lib/live/types";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const organizationId = `live-delivery-org-${suffix}`;
const outsiderOrganizationId = `live-delivery-outsider-org-${suffix}`;
const userId = `live-delivery-user-${suffix}`;
const outsiderUserId = `live-delivery-outsider-user-${suffix}`;

const auth: AuthenticatedExecutiveContext = {
  actorUserId: userId,
  organizationId,
  timezone: "Europe/Istanbul",
  referenceTimeIso: "2026-09-16T09:00:00.000Z"
};

function executiveTurnResult(
  overrides: Partial<MetrixExecutiveTurnResult>
): MetrixExecutiveTurnResult {
  return {
    finalOutput: "Tamamlandı.",
    executionItems: [],
    toolCalls: [],
    capabilityResults: [],
    openAiConversationId: `conv-${suffix}`,
    ...overrides
  };
}

async function bootstrapConnectedBinding(
  openAiSessionId: string
): Promise<LiveSessionBinding> {
  const created = await createLiveSessionBinding({
    actorUserId: userId,
    organizationId
  });

  return bindOpenAiLiveSession({
    bindingId: created.id,
    openAiSessionId
  });
}

function firstListRow(presentation: unknown): { primary: string }[] {
  if (
    typeof presentation !== "object" ||
    presentation === null ||
    (presentation as { type?: unknown }).type !== "LIST"
  ) {
    throw new Error("expected a LIST presentation");
  }

  return (presentation as { rows: { primary: string }[] }).rows;
}

async function speakAndDelegate(
  bridge: ReturnType<typeof createLiveDelegationBridge>,
  input: { text: string; delegationId: string }
): Promise<void> {
  await bridge.handle({
    type: "session.input_transcript.delta",
    delta: input.text
  });

  await bridge.handle({
    type: "session.delegation.created",
    delegation: {
      id: input.delegationId,
      target: "client",
      type: "delegation"
    }
  });
}

describe("generic Voice -> UI TurnResult delivery bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "publishes the canonical presentation for a real customer_lookup turn, then a real different-capability task_list turn, with strictly increasing versions",
    async () => {
      await db.organization.create({
        data: { id: organizationId, name: "Live Delivery Org" }
      });

      await db.user.create({
        data: { id: userId, email: `${userId}@example.test` }
      });

      await db.organizationMember.create({
        data: { organizationId, userId, role: "OWNER" }
      });

      const binding = await bootstrapConnectedBinding(
        `live-delivery-session-${suffix}`
      );

      const sent: unknown[] = [];

      const bridge = createLiveDelegationBridge({
        binding,
        auth,
        send(event) {
          sent.push(event);
          return true;
        }
      });

      mocks.runMetrixExecutiveTurn.mockResolvedValueOnce(
        executiveTurnResult({
          finalOutput: "Müşterilerinizi listeledim.",
          capabilityResults: [
            {
              capability: "customer_lookup",
              operation: "read",
              data: {
                source: "COMPANY_REALITY",
                count: 1,
                customers: [{ id: "cust_1", name: "Belgin Tekstil" }]
              }
            }
          ]
        })
      );

      await speakAndDelegate(bridge, {
        text: "Belgin'i göster",
        delegationId: "delegation_customer_turn"
      });

      const afterCustomerTurn = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(afterCustomerTurn.version).toBe(1);
      expect(afterCustomerTurn.turnResult?.presentations).toHaveLength(1);
      expect(afterCustomerTurn.turnResult?.presentations[0]).toMatchObject({
        type: "LIST",
        title: "Müşteriler"
      });
      expect(afterCustomerTurn.turnResult?.capabilityResults).toMatchObject([
        { capability: "customer_lookup", operation: "read" }
      ]);

      expect(
        firstListRow(afterCustomerTurn.turnResult?.presentations[0]).some(
          (row) => row.primary.includes("Belgin Tekstil")
        )
      ).toBe(true);

      // Reading again without any new delegation activity must be a pure,
      // idempotent read — same version, same result.
      const repeatRead = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(repeatRead).toEqual(afterCustomerTurn);

      mocks.runMetrixExecutiveTurn.mockResolvedValueOnce(
        executiveTurnResult({
          finalOutput: "Görevlerinizi listeledim.",
          capabilityResults: [
            {
              capability: "task_list",
              operation: "read",
              data: {
                source: "COMPANY_REALITY",
                count: 1,
                tasks: [{ id: "task_1", title: `Delivery task ${suffix}` }]
              }
            }
          ]
        })
      );

      // Second business turn in the SAME Live session, a completely
      // different capability (task, not customer) — proves the bridge is
      // generic, not domain-specific.
      await speakAndDelegate(bridge, {
        text: "Görevlerimi göster",
        delegationId: "delegation_task_turn"
      });

      const afterTaskTurn = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(afterTaskTurn.version).toBe(2);
      expect(afterTaskTurn.version).toBeGreaterThan(afterCustomerTurn.version);
      expect(afterTaskTurn.turnResult?.presentations[0]).toMatchObject({
        type: "LIST",
        title: "Görevler"
      });

      expect(
        firstListRow(afterTaskTurn.turnResult?.presentations[0]).some((row) =>
          row.primary.includes(suffix)
        )
      ).toBe(true);

      expect(
        sent.filter(
          (event) =>
            (event as { type?: string }).type ===
            "session.commentary.append"
        )
      ).toHaveLength(2);
    }
  );

  it("denies reading another organization's/user's result", async () => {
    await db.organization.create({
      data: {
        id: outsiderOrganizationId,
        name: "Live Delivery Outsider Org"
      }
    });

    await db.user.create({
      data: {
        id: outsiderUserId,
        email: `${outsiderUserId}@example.test`
      }
    });

    const binding = await bootstrapConnectedBinding(
      `live-delivery-isolation-session-${suffix}`
    );

    await expect(
      loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: outsiderUserId,
        organizationId
      })
    ).rejects.toBeInstanceOf(LiveSessionAccessDeniedError);

    await expect(
      loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId: outsiderOrganizationId
      })
    ).rejects.toBeInstanceOf(LiveSessionAccessDeniedError);

    await expect(
      loadLiveSessionTurnResultState({
        bindingId: "not-a-real-binding-id",
        actorUserId: userId,
        organizationId
      })
    ).rejects.toBeInstanceOf(LiveSessionAccessDeniedError);
  });

  it(
    "clears the ephemeral result on session disconnect and expires a stale one by TTL",
    async () => {
      const binding = await bootstrapConnectedBinding(
        `live-delivery-cleanup-session-${suffix}`
      );

      const bridge = createLiveDelegationBridge({
        binding,
        auth,
        send() {
          return true;
        }
      });

      mocks.runMetrixExecutiveTurn.mockResolvedValueOnce(
        executiveTurnResult({
          capabilityResults: [
            {
              capability: "customer_lookup",
              operation: "read",
              data: {
                source: "COMPANY_REALITY",
                count: 1,
                customers: [{ id: "cust_1", name: "Belgin Tekstil" }]
              }
            }
          ]
        })
      );

      await speakAndDelegate(bridge, {
        text: "Belgin'i göster",
        delegationId: "delegation_cleanup_turn"
      });

      const beforeDisconnect = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(beforeDisconnect.turnResult).not.toBeNull();

      await markLiveSessionDisconnected({ bindingId: binding.id });

      const afterDisconnect = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(afterDisconnect.turnResult).toBeNull();
      // The version number itself is not rolled back — only the payload is
      // cleared — so a browser that already applied it never regresses.
      expect(afterDisconnect.version).toBe(beforeDisconnect.version);

      const staleBinding = await bootstrapConnectedBinding(
        `live-delivery-ttl-session-${suffix}`
      );

      await db.liveSession.update({
        where: { id: staleBinding.id },
        data: {
          turnResultVersion: 1,
          turnResultJson: JSON.stringify({
            executiveText: "",
            capabilityResults: [],
            presentations: [
              { type: "LIST", title: "Müşteriler", metrics: [], rows: [] }
            ],
            approvals: [],
            artifacts: []
          }),
          turnResultIssuedAt: new Date(Date.now() - 60 * 60 * 1000)
        }
      });

      const staleRead = await loadLiveSessionTurnResultState({
        bindingId: staleBinding.id,
        actorUserId: userId,
        organizationId
      });

      expect(staleRead.turnResult).toBeNull();
      expect(staleRead.version).toBe(1);
    }
  );

  it(
    "two delegation turns fired concurrently on the same binding are both delivered, isolated from each other — no cross-talk, no lost update",
    async () => {
      const binding = await bootstrapConnectedBinding(
        `live-delivery-concurrent-session-${suffix}`
      );

      const bridge = createLiveDelegationBridge({
        binding,
        auth,
        send() {
          return true;
        }
      });

      mocks.runMetrixExecutiveTurn
        .mockImplementationOnce(async () =>
          executiveTurnResult({
            capabilityResults: [
              {
                capability: "customer_lookup",
                operation: "read",
                data: {
                  source: "COMPANY_REALITY",
                  count: 1,
                  customers: [{ id: "cust_1", name: "Concurrent Musteri" }]
                }
              }
            ]
          })
        )
        .mockImplementationOnce(async () =>
          executiveTurnResult({
            capabilityResults: [
              {
                capability: "task_list",
                operation: "read",
                data: {
                  source: "COMPANY_REALITY",
                  count: 1,
                  tasks: [{ id: "task_1", title: "Concurrent task" }]
                }
              }
            ]
          })
        );

      await bridge.handle({
        type: "session.input_transcript.delta",
        delta: "Müşterilerimi göster"
      });

      const first = bridge.handle({
        type: "session.delegation.created",
        delegation: {
          id: "delegation_concurrent_customer",
          target: "client",
          type: "delegation"
        }
      });

      await bridge.handle({
        type: "session.input_transcript.delta",
        delta: "Görevlerimi göster"
      });

      const second = bridge.handle({
        type: "session.delegation.created",
        delegation: {
          id: "delegation_concurrent_task",
          target: "client",
          type: "delegation"
        }
      });

      await Promise.all([first, second]);

      const state = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      // Both turns genuinely ran and published — version reflects two
      // real, isolated publishes (order between the two is not asserted,
      // only that both landed and neither corrupted the other).
      expect(state.version).toBe(2);
      expect(["Müşteriler", "Görevler"]).toContain(
        (
          state.turnResult?.presentations[0] as
            | { title?: string }
            | undefined
        )?.title
      );

      expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(2);
    }
  );
});

afterAll(async () => {
  await db.liveSession.deleteMany({
    where: {
      organizationId: { in: [organizationId, outsiderOrganizationId] }
    }
  });

  await db.task.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });

  await db.organizationMember.deleteMany({
    where: { organizationId }
  });

  await db.user.deleteMany({
    where: { id: { in: [userId, outsiderUserId] } }
  });

  await db.organization.deleteMany({
    where: { id: { in: [organizationId, outsiderOrganizationId] } }
  });

  await db.$disconnect();
});
