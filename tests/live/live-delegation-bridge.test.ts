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

// This is the client-delegation bridge's own unit-level regression
// harness: runMetrixExecutiveTurn (the single backend Executive — the
// SAME Agent/tool set the text turn runs) is mocked here, because Sol's
// own native tool-selection is already covered elsewhere (e.g.
// tests/agent/executive-pipeline.acceptance.test.ts, task-operational-
// awareness.acceptance.test.ts). What THIS file proves is the bridge's
// own responsibility: reconstructing an utterance from buffered
// transcript deltas, correlating one Live session's conversation memory
// across delegation turns, publishing exactly the TurnResult a turn
// produced, replying over the correct delegation_id, and — the acceptance
// gate this operation exists to satisfy — isolating one backend Executive
// failure to its own delegation turn without harming the next one.
const mocks =
  vi.hoisted(() => ({
    runMetrixExecutiveTurn:
      vi.fn(),
    recordLiveLifecycle:
      vi.fn(),
    publishLiveSessionTurnResult:
      vi.fn(),
    loadLiveSessionExecutiveConversationId:
      vi.fn(),
    persistLiveSessionExecutiveConversationId:
      vi.fn(),
    sent:
      [] as unknown[],
    turnResultVersion: 0
  }));

vi.mock(
  "../../src/lib/agent/metrix-executive-agent",
  async () => {
    const actual =
      await vi.importActual<
        typeof import(
          "../../src/lib/agent/metrix-executive-agent"
        )
      >(
        "../../src/lib/agent/metrix-executive-agent"
      );

    return {
      ...actual,
      runMetrixExecutiveTurn:
        mocks.runMetrixExecutiveTurn
    };
  }
);

vi.mock(
  "../../src/lib/live/live-observability",
  () => ({
    recordLiveLifecycle:
      mocks.recordLiveLifecycle
  })
);

vi.mock(
  "../../src/lib/live/live-session-store",
  async () => {
    const actual =
      await vi.importActual<
        typeof import(
          "../../src/lib/live/live-session-store"
        )
      >(
        "../../src/lib/live/live-session-store"
      );

    return {
      ...actual,
      publishLiveSessionTurnResult:
        mocks.publishLiveSessionTurnResult,
      loadLiveSessionExecutiveConversationId:
        mocks.loadLiveSessionExecutiveConversationId,
      persistLiveSessionExecutiveConversationId:
        mocks.persistLiveSessionExecutiveConversationId
    };
  }
);

const binding: LiveSessionBinding = {
  id: "binding_bridge_1",
  openAiSessionId:
    "live_session_bridge_1",
  userId: "user_1",
  organizationId: "org_1",
  status: "CONNECTED",
  createdAt: new Date(
    "2026-09-17T09:00:00.000Z"
  ),
  connectedAt: new Date(
    "2026-09-17T09:00:01.000Z"
  ),
  sidebandAttachedAt: null,
  endedAt: null,
  failureCode: null
};

const auth: AuthenticatedExecutiveContext = {
  actorUserId: "user_1",
  organizationId: "org_1",
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-17T09:00:00.000Z"
};

function inputTranscriptDelta(
  delta: string
) {
  return {
    type:
      "session.input_transcript.delta",
    event_id:
      `evt_${Math.random()
        .toString(36)
        .slice(2)}`,
    start_ms: 0,
    end_ms: 0,
    delta
  } as const;
}

function delegationCreated(
  id: string,
  target: "client" | "responses" = "client"
) {
  return {
    type:
      "session.delegation.created",
    event_id:
      `evt_${Math.random()
        .toString(36)
        .slice(2)}`,
    offset_ms: 0,
    delegation: {
      id,
      target,
      type: "delegation"
    }
  } as const;
}

function executiveTurnResult(
  overrides: Partial<MetrixExecutiveTurnResult>
): MetrixExecutiveTurnResult {
  return {
    finalOutput: "Tamamlandı.",
    executionItems: [],
    toolCalls: [],
    capabilityResults: [],
    openAiConversationId:
      "conv_default",
    ...overrides
  };
}

describe(
  "client-delegation bridge",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.sent.length = 0;
      mocks.turnResultVersion = 0;

      mocks.loadLiveSessionExecutiveConversationId
        .mockResolvedValue(
          undefined
        );

      mocks.publishLiveSessionTurnResult
        .mockImplementation(
          async () => ({
            version:
              ++mocks.turnResultVersion
          })
        );
    });

    function send(
      event: unknown
    ): boolean {
      mocks.sent.push(event);
      return true;
    }

    it(
      "reconstructs the delegated utterance from buffered transcript deltas and runs the single backend Executive",
      async () => {
        mocks.runMetrixExecutiveTurn
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput:
                "İşte müşterileriniz.",
              capabilityResults: [
                {
                  capability:
                    "customer_lookup",
                  operation:
                    "read",
                  data: {
                    source:
                      "COMPANY_REALITY",
                    count: 1,
                    customers: [
                      {
                        id: "cust_1"
                      }
                    ]
                  }
                }
              ],
              openAiConversationId:
                "conv_1"
            })
          );

        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        await bridge.handle(
          inputTranscriptDelta(
            "Müşteri"
          )
        );

        await bridge.handle(
          inputTranscriptDelta(
            "lerimi göster"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_1"
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledWith({
          actorUserId: "user_1",
          organizationId: "org_1",
          turnId: "delegation_1",
          message:
            "Müşterilerimi göster",
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-17T09:00:00.000Z",
          openAiConversationId:
            undefined
        });

        expect(
          mocks.publishLiveSessionTurnResult
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.publishLiveSessionTurnResult
        ).toHaveBeenCalledWith({
          bindingId:
            "binding_bridge_1",
          turnResult:
            expect.objectContaining(
              {
                capabilityResults:
                  expect.arrayContaining(
                    [
                      expect.objectContaining(
                        {
                          capability:
                            "customer_lookup"
                        }
                      )
                    ]
                  )
              }
            )
        });

        expect(
          mocks.persistLiveSessionExecutiveConversationId
        ).toHaveBeenCalledWith({
          bindingId:
            "binding_bridge_1",
          executiveConversationId:
            "conv_1"
        });

        expect(
          mocks.sent
        ).toEqual([
          {
            type:
              "session.commentary.append",
            delegation_id:
              "delegation_1",
            content:
              "İşte müşterileriniz."
          }
        ]);
      }
    );

    it(
      "reuses the session-scoped conversation binding on the next delegation turn",
      async () => {
        mocks.loadLiveSessionExecutiveConversationId
          .mockResolvedValueOnce(
            undefined
          )
          .mockResolvedValueOnce(
            "conv_1"
          );

        mocks.runMetrixExecutiveTurn
          .mockResolvedValueOnce(
            executiveTurnResult({
              openAiConversationId:
                "conv_1"
            })
          )
          .mockResolvedValueOnce(
            executiveTurnResult({
              openAiConversationId:
                "conv_1"
            })
          );

        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        await bridge.handle(
          inputTranscriptDelta(
            "Görevlerimi göster"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_1"
          )
        );

        await bridge.handle(
          inputTranscriptDelta(
            "Takvimimi göster"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_2"
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining(
            {
              turnId:
                "delegation_1",
              openAiConversationId:
                undefined
            }
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining(
            {
              turnId:
                "delegation_2",
              openAiConversationId:
                "conv_1"
            }
          )
        );
      }
    );

    it(
      "isolates a forced backend Executive failure to its own delegation turn — the next turn succeeds without restarting the session",
      async () => {
        mocks.runMetrixExecutiveTurn
          .mockRejectedValueOnce(
            new Error(
              "Executive backend forced failure"
            )
          )
          .mockResolvedValueOnce(
            executiveTurnResult({
              finalOutput:
                "Görevlerinizi listeledim.",
              capabilityResults: [
                {
                  capability:
                    "task_list",
                  operation:
                    "read",
                  data: {
                    source:
                      "COMPANY_REALITY",
                    count: 0,
                    tasks: []
                  }
                }
              ]
            })
          );

        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        await bridge.handle(
          inputTranscriptDelta(
            "Derin bir stratejik analiz yap"
          )
        );

        await expect(
          bridge.handle(
            delegationCreated(
              "delegation_failed"
            )
          )
        ).resolves.toBeUndefined();

        expect(
          mocks.publishLiveSessionTurnResult
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent
        ).toEqual([
          expect.objectContaining(
            {
              delegation_id:
                "delegation_failed",
              content:
                expect.stringContaining(
                  "tekrar dener misin"
                )
            }
          )
        ]);

        // Sanitized failure classification reached the diagnostics call —
        // and the raw exception message never did, anywhere in that call.
        const failedLifecycleCall =
          mocks.recordLiveLifecycle.mock.calls.find(
            ([event]: any) =>
              event.phase === "EXECUTIVE_TURN" &&
              event.status === "FAILED"
          );

        expect(failedLifecycleCall).toBeTruthy();

        expect(failedLifecycleCall![0]).toMatchObject(
          {
            errorClass: "Error",
            errorCategory: "UNKNOWN"
          }
        );

        expect(
          failedLifecycleCall![0]
        ).not.toHaveProperty("errorMessage");

        expect(
          JSON.stringify(mocks.recordLiveLifecycle.mock.calls)
        ).not.toContain(
          "Executive backend forced failure"
        );

        await bridge.handle(
          inputTranscriptDelta(
            "Görevlerimi göster"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_recovered"
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.publishLiveSessionTurnResult
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sent
        ).toHaveLength(2);

        expect(
          mocks.sent[1]
        ).toMatchObject({
          delegation_id:
            "delegation_recovered",
          content:
            "Görevlerinizi listeledim."
        });
      }
    );

    it(
      "ignores a duplicate delegation.created for an already-handled delegation id",
      async () => {
        mocks.runMetrixExecutiveTurn
          .mockResolvedValueOnce(
            executiveTurnResult({})
          );

        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        await bridge.handle(
          inputTranscriptDelta(
            "Merhaba"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_dup"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_dup"
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "replies gracefully without calling the backend Executive when no transcript was buffered",
      async () => {
        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        await bridge.handle(
          delegationCreated(
            "delegation_empty"
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent
        ).toEqual([
          expect.objectContaining(
            {
              delegation_id:
                "delegation_empty",
              content:
                expect.stringContaining(
                  "tekrar söyler misin"
                )
            }
          )
        ]);
      }
    );

    it(
      "ignores a Responses-delegation event target",
      async () => {
        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        await bridge.handle(
          inputTranscriptDelta(
            "Bu bir Responses delegation olayı"
          )
        );

        await bridge.handle(
          delegationCreated(
            "delegation_responses",
            "responses"
          )
        );

        expect(
          mocks.runMetrixExecutiveTurn
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent
        ).toHaveLength(0);
      }
    );

    it(
      "rejects construction when the binding's trusted actor/organization does not match the authenticated context",
      async () => {
        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        expect(() =>
          createLiveDelegationBridge({
            binding,
            auth: {
              ...auth,
              organizationId:
                "org_mismatch"
            },
            send
          })
        ).toThrow(
          "Live trusted context mismatch"
        );
      }
    );

    it(
      "drives the full required multi-turn business chain across one logical Live session with monotonically increasing TurnResult versions",
      async () => {
        const turns: Array<{
          userSpeech: string;
          result: MetrixExecutiveTurnResult;
        }> = [
          {
            userSpeech:
              "Müşterilerimi göster",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Müşterilerinizi listeledim.",
                capabilityResults: [
                  {
                    capability:
                      "customer_lookup",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 1,
                      customers: [
                        { id: "cust_1" }
                      ]
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Görevlerimi göster",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Görevlerinizi listeledim.",
                capabilityResults: [
                  {
                    capability:
                      "task_list",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 0,
                      tasks: []
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Yarın Ahmet'i ara diye görev oluştur",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Görevi oluşturdum ve doğruladım.",
                capabilityResults: [
                  {
                    capability:
                      "task_create",
                    operation:
                      "mutation",
                    data: {
                      taskId:
                        "task_1"
                    },
                    verification: {
                      status:
                        "VERIFIED",
                      verified: true
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Takvimimi göster",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Takviminizi listeledim.",
                capabilityResults: [
                  {
                    capability:
                      "calendar_list",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 0,
                      events: []
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Yarın 14:00 toplantı oluştur",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Toplantıyı oluşturdum ve doğruladım.",
                capabilityResults: [
                  {
                    capability:
                      "calendar_create",
                    operation:
                      "mutation",
                    data: {
                      eventId:
                        "event_1"
                    },
                    verification: {
                      status:
                        "VERIFIED",
                      verified: true
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Ürünlerimi göster",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Ürünlerinizi listeledim.",
                capabilityResults: [
                  {
                    capability:
                      "product_service_lookup",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 0,
                      items: []
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Teklif hazırla",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Teklifi hazırladım ve doğruladım.",
                capabilityResults: [
                  {
                    capability:
                      "quote_create",
                    operation:
                      "mutation",
                    data: {
                      quoteId:
                        "quote_1"
                    },
                    verification: {
                      status:
                        "VERIFIED",
                      verified: true
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Görevlerimi tekrar göster",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Görevlerinizi tekrar listeledim.",
                capabilityResults: [
                  {
                    capability:
                      "task_list",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 1,
                      tasks: [
                        { id: "task_1" }
                      ]
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Bu çeyrekteki tüm satış ve stok verilerini birlikte değerlendirip önceliklendirme önerisi sun",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Çok alanlı analizi tamamladım: önceliğiniz X.",
                capabilityResults: [
                  {
                    capability:
                      "quote_lookup",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 1,
                      quotes: [
                        { id: "quote_1" }
                      ]
                    }
                  },
                  {
                    capability:
                      "inventory_lookup",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 0,
                      movements: []
                    }
                  }
                ]
              }
            )
          },
          {
            userSpeech:
              "Son olarak görevlerimi bir daha göster",
            result: executiveTurnResult(
              {
                finalOutput:
                  "Görevlerinizi son kez listeledim.",
                capabilityResults: [
                  {
                    capability:
                      "task_list",
                    operation:
                      "read",
                    data: {
                      source:
                        "COMPANY_REALITY",
                      count: 1,
                      tasks: [
                        { id: "task_1" }
                      ]
                    }
                  }
                ]
              }
            )
          }
        ];

        for (const turn of turns) {
          mocks.runMetrixExecutiveTurn
            .mockResolvedValueOnce(
              turn.result
            );
        }

        const {
          createLiveDelegationBridge
        } =
          await import(
            "../../src/lib/live/live-delegation-bridge"
          );

        const bridge =
          createLiveDelegationBridge({
            binding,
            auth,
            send
          });

        for (
          let index = 0;
          index < turns.length;
          index += 1
        ) {
          await bridge.handle(
            inputTranscriptDelta(
              turns[index].userSpeech
            )
          );

          await bridge.handle(
            delegationCreated(
              `delegation_${index}`
            )
          );
        }

        expect(
          mocks.runMetrixExecutiveTurn
        ).toHaveBeenCalledTimes(
          turns.length
        );

        // Every turn ran under the same trusted actor/organization —
        // tenant isolation never widens or narrows mid-session.
        for (
          const call
          of mocks.runMetrixExecutiveTurn
            .mock.calls
        ) {
          expect(
            call[0]
          ).toMatchObject({
            actorUserId: "user_1",
            organizationId: "org_1"
          });
        }

        expect(
          mocks.publishLiveSessionTurnResult
        ).toHaveBeenCalledTimes(
          turns.length
        );

        const publishedVersions =
          mocks.publishLiveSessionTurnResult
            .mock.results.map(
              (settled) =>
                settled.value
            );

        // The bridge publishes strictly sequentially per delegation
        // turn — the in-memory version counter set up in beforeEach
        // mirrors the durable row's own monotonic increment exactly.
        for (
          let index = 0;
          index < turns.length;
          index += 1
        ) {
          expect(
            mocks.publishLiveSessionTurnResult
          ).toHaveBeenNthCalledWith(
            index + 1,
            expect.objectContaining(
              {
                bindingId:
                  "binding_bridge_1"
              }
            )
          );
        }

        expect(
          publishedVersions.length
        ).toBe(
          turns.length
        );

        expect(
          mocks.sent
        ).toHaveLength(
          turns.length
        );

        for (
          let index = 0;
          index < turns.length;
          index += 1
        ) {
          expect(
            mocks.sent[index]
          ).toMatchObject({
            type:
              "session.commentary.append",
            delegation_id:
              `delegation_${index}`,
            content:
              turns[index].result
                .finalOutput
          });
        }

        // No delegation id was ever handled twice across the whole
        // chain — each of the 10 canonical turns executed exactly once.
        const delegationIdsSent =
          mocks.sent.map(
            (event) =>
              (event as {
                delegation_id: string;
              }).delegation_id
          );

        expect(
          new Set(delegationIdsSent)
            .size
        ).toBe(
          turns.length
        );
      }
    );
  }
);
