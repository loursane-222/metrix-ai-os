import {
  readFileSync
} from "node:fs";

import {
  afterAll,
  beforeAll,
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

// Regression coverage for the delivery-decoupling invariant the original
// (Responses-delegation) sideband implementation was built to protect:
// the canonical result publish must never depend on anything that
// happens AFTER the backend Executive turn itself succeeds — not a
// narration/commentary send, not a duplicate/replayed protocol event.
// Under client delegation there is no separate "protocol continuation"
// step at all (no response.item.create/response.create to race with),
// so the decoupling is now structural — deliverTurnResult always runs,
// and always completes, before sendCommentary is even attempted (see
// live-delegation-bridge.ts's handleDelegationCreated). These tests
// prove that against a real (unmocked) Postgres database; only the
// backend Executive turn itself is mocked (Sol's own real tool-selection
// is proven elsewhere — see live-result-delivery.test.ts's header
// comment for the same rationale).
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
  bindOpenAiLiveSession,
  createLiveSessionBinding,
  loadLiveSessionTurnResultState
} from "../../src/lib/live/live-session-store";

import type { AuthenticatedExecutiveContext } from "../../src/lib/auth/executive-session-context";
import type { LiveSessionBinding } from "../../src/lib/live/types";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const organizationId = `decoupling-org-${suffix}`;
const userId = `decoupling-user-${suffix}`;

const auth: AuthenticatedExecutiveContext = {
  actorUserId: userId,
  organizationId,
  timezone: "Europe/Istanbul",
  referenceTimeIso: "2026-09-17T09:00:00.000Z"
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

function firstPresentation(turnResult: unknown) {
  return (
    turnResult as { presentations: { type: string; title: string }[] } | null
  )?.presentations[0];
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

describe("Result delivery is decoupled from the spoken commentary reply", () => {
  beforeAll(async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Decoupling Org" }
    });

    await db.user.create({
      data: { id: userId, email: `${userId}@example.test` }
    });

    await db.organizationMember.create({
      data: { organizationId, userId, role: "OWNER" }
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "keeps an already-successful publish even when the commentary send() throws (a sideband transport failure)",
    async () => {
      const binding = await bootstrapConnectedBinding(
        `decoupling-send-fails-${suffix}`
      );

      let sendCalls = 0;

      const bridge = createLiveDelegationBridge({
        binding,
        auth,
        send() {
          sendCalls += 1;
          throw new Error("simulated sideband transport failure");
        }
      });

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
                tasks: [{ id: "task_1", title: `Continuation task ${suffix}` }]
              }
            }
          ]
        })
      );

      // send() throwing synchronously is a caller bug this bridge does
      // not protect against by design (the real sideband.send() never
      // throws — see the doc comment on DelegationBridgeSender) — what
      // matters here is that the throw happens strictly AFTER
      // deliverTurnResult has already durably published.
      await expect(
        speakAndDelegate(bridge, {
          text: "Görevlerimi göster",
          delegationId: "delegation_send_fails"
        })
      ).rejects.toThrow("simulated sideband transport failure");

      expect(sendCalls).toBeGreaterThan(0);

      const state = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(state.version).toBe(1);
      expect(firstPresentation(state.turnResult)).toMatchObject({
        type: "LIST",
        title: "Görevler"
      });
    }
  );

  it(
    "publishes nothing when the backend Executive turn itself fails",
    async () => {
      const binding = await bootstrapConnectedBinding(
        `decoupling-executive-failure-${suffix}`
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

      mocks.runMetrixExecutiveTurn.mockRejectedValueOnce(
        new Error("forced Executive failure")
      );

      await speakAndDelegate(bridge, {
        text: "Derin bir analiz yap",
        delegationId: "delegation_bad_turn"
      });

      const state = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      expect(state.version).toBe(0);
      expect(state.turnResult).toBeNull();

      // A graceful spoken fallback is still sent — the session stays
      // responsive even though nothing was published.
      expect(
        sent.filter(
          (event) =>
            (event as { type?: string }).type ===
            "session.commentary.append"
        )
      ).toHaveLength(1);
    }
  );

  it(
    "publishes exactly once for one real turn, even when the same delegation.created is re-sent (duplicate/replayed event)",
    async () => {
      const binding = await bootstrapConnectedBinding(
        `decoupling-exactly-once-${suffix}`
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
                customers: [{ id: "cust_1", name: "Exactly Once Musteri" }]
              }
            }
          ]
        })
      );

      await bridge.handle({
        type: "session.input_transcript.delta",
        delta: "Exactly Once Musteri'yi göster"
      });

      const delegation = {
        type: "session.delegation.created",
        delegation: {
          id: "delegation_exactly_once",
          target: "client",
          type: "delegation"
        }
      } as const;

      // Re-sent as a genuinely duplicate event for the same delegation id.
      await bridge.handle(delegation);
      await bridge.handle(delegation);
      await bridge.handle(delegation);

      const state = await loadLiveSessionTurnResultState({
        bindingId: binding.id,
        actorUserId: userId,
        organizationId
      });

      // Not 3 — the duplicate/replayed events never reach
      // runMetrixExecutiveTurn at all (rejected upstream by the
      // handledDelegationIds guard), so they never have a turn to
      // publish in the first place.
      expect(state.version).toBe(1);
      expect(mocks.runMetrixExecutiveTurn).toHaveBeenCalledTimes(1);
    }
  );
});

describe("the delegation bridge never special-cases a business domain in its own delivery code path", () => {
  it(
    "reads no domain name in deliverTurnResult — the generic projection alone decides the presentation",
    () => {
      const source = readFileSync(
        "src/lib/live/live-delegation-bridge.ts",
        "utf8"
      );

      const deliverStart = source.indexOf(
        "async function deliverTurnResult"
      );
      const deliverEnd = source.indexOf(
        "async function handleDelegationCreated"
      );

      expect(deliverStart).toBeGreaterThan(-1);
      expect(deliverEnd).toBeGreaterThan(deliverStart);

      const deliverBody = source.slice(deliverStart, deliverEnd);

      expect(deliverBody).not.toMatch(
        /customer|task|invoice|inventory|offer|calendar|quote|supplier|purchase/i
      );
    }
  );
});

afterAll(async () => {
  await db.liveSession.deleteMany({
    where: { organizationId }
  });

  await db.task.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });

  await db.organizationMember.deleteMany({
    where: { organizationId }
  });

  await db.user.deleteMany({
    where: { id: userId }
  });

  await db.organization.deleteMany({
    where: { id: organizationId }
  });

  await db.$disconnect();
});
