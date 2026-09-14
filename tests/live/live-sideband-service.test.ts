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

const mocks =
  vi.hoisted(() => ({
    executeMetrixBusinessTool:
      vi.fn(),
    recordLiveLifecycle:
      vi.fn(),
    sent:
      [] as unknown[]
  }));

vi.mock(
  "../../src/lib/agent/tools/metrix-business-tool-runtime",
  async () => {
    const actual =
      await vi.importActual<
        typeof import(
          "../../src/lib/agent/tools/metrix-business-tool-runtime"
        )
      >(
        "../../src/lib/agent/tools/metrix-business-tool-runtime"
      );

    return {
      ...actual,
      executeMetrixBusinessTool:
        mocks.executeMetrixBusinessTool
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

const binding: LiveSessionBinding = {
  id: "binding_1",
  openAiSessionId:
    "live_session_1",
  userId:
    "user_1",
  organizationId:
    "org_1",
  status:
    "CONNECTED",
  createdAt:
    new Date(
      "2026-09-14T07:50:00.000Z"
    ),
  connectedAt:
    new Date(
      "2026-09-14T07:50:01.000Z"
    ),
  sidebandAttachedAt:
    null,
  endedAt:
    null,
  failureCode:
    null
};

const auth:
  AuthenticatedExecutiveContext = {
    actorUserId:
      "user_1",
    organizationId:
      "org_1",
    timezone:
      "Europe/Istanbul",
    referenceTimeIso:
      "2026-09-14T07:50:00.000Z"
  };

function completed(
  responseId = "response_1"
) {
  return {
    type:
      "response.event",
    delegation_id:
      "delegation_1",
    event: {
      type:
        "response.completed",
      response: {
        id:
          responseId
      }
    }
  } as const;
}

describe(
  "trusted Live sideband function lifecycle",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.sent.length = 0;
    });

    it(
      "executes a completed function call with exact trusted scope and continues only at terminal flush",
      async () => {
        mocks.executeMetrixBusinessTool
          .mockResolvedValueOnce({
            ok: true,
            verificationStatus:
              "VERIFIED",
            taskId:
              "task_1"
          });

        const {
          createLiveSidebandProtocol
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const protocol =
          createLiveSidebandProtocol({
            binding,
            auth,
            send(event: unknown) {
              mocks.sent.push(event);
            }
          });

        const argumentsJson =
          JSON.stringify({
            title:
              "Belgin tahsilatını kontrol et",
            priority:
              "HIGH",
            dueAt:
              "2026-09-15T15:30:00+03:00"
          });

        await protocol.handle({
          type:
            "response.event",
          delegation_id:
            "delegation_1",
          event: {
            type:
              "response.output_item.done",
            response_id:
              "response_1",
            item: {
              type:
                "function_call",
              call_id:
                "call_1",
              name:
                "task_create",
              arguments:
                argumentsJson
            }
          }
        });

        expect(
          mocks.executeMetrixBusinessTool
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.executeMetrixBusinessTool
        ).toHaveBeenCalledWith({
          name:
            "task_create",
          argumentsJson,
          context: {
            actorUserId:
              "user_1",
            organizationId:
              "org_1",
            timezone:
              "Europe/Istanbul",
            referenceTimeIso:
              "2026-09-14T07:50:00.000Z",
            idempotencyScope:
              "live:binding_1:call:call_1"
          }
        });

        expect(
          mocks.sent
        ).toHaveLength(0);

        await protocol.handle(
          completed()
        );

        expect(
          mocks.sent
        ).toHaveLength(2);

        expect(
          mocks.sent[0]
        ).toEqual(
          expect.objectContaining({
            type:
              "response.item.create",
            item:
              expect.objectContaining({
                type:
                  "function_call_output",
                call_id:
                  "call_1"
              })
          })
        );

        expect(
          mocks.sent[1]
        ).toEqual(
          expect.objectContaining({
            type:
              "response.create",})
        );
      }
    );

    it(
      "does not execute a non-function output item",
      async () => {
        const {
          createLiveSidebandProtocol
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const protocol =
          createLiveSidebandProtocol({
            binding,
            auth,
            send(event: unknown) {
              mocks.sent.push(event);
            }
          });

        await protocol.handle({
          type:
            "response.event",
          delegation_id:
            "delegation_1",
          event: {
            type:
              "response.output_item.done",
            response_id:
              "response_1",
            item: {
              type:
                "message",
              id:
                "message_1"
            }
          }
        });

        await protocol.handle(
          completed()
        );

        expect(
          mocks.executeMetrixBusinessTool
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent
        ).toHaveLength(0);
      }
    );

    it(
      "executes duplicate delivery only once and emits one saved result",
      async () => {
        mocks.executeMetrixBusinessTool
          .mockResolvedValue({
            ok: true,
            verificationStatus:
              "VERIFIED"
          });

        const {
          createLiveSidebandProtocol
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const protocol =
          createLiveSidebandProtocol({
            binding,
            auth,
            send(event: unknown) {
              mocks.sent.push(event);
            }
          });

        const event = {
          type:
            "response.event",
          delegation_id:
            "delegation_1",
          event: {
            type:
              "response.output_item.done",
            response_id:
              "response_1",
            item: {
              type:
                "function_call",
              call_id:
                "call_duplicate",
              name:
                "task_create",
              arguments:
                JSON.stringify({
                  title:
                    "Tek kez oluştur"
                })
            }
          }
        } as const;

        await protocol.handle(event);
        await protocol.handle(event);
        await protocol.handle(
          completed()
        );

        expect(
          mocks.executeMetrixBusinessTool
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.sent.filter(
            (
              item:
                any
            ) =>
              item?.type ===
                "response.item.create"
          )
        ).toHaveLength(1);

        expect(
          mocks.sent.filter(
            (
              item:
                any
            ) =>
              item?.type ===
                "response.create"
          )
        ).toHaveLength(1);
      }
    );

    it(
      "waits for all collected function calls before one continuation",
      async () => {
        mocks.executeMetrixBusinessTool
          .mockResolvedValue({
            ok: true,
            verificationStatus:
              "VERIFIED"
          });

        const {
          createLiveSidebandProtocol
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const protocol =
          createLiveSidebandProtocol({
            binding,
            auth,
            send(event: unknown) {
              mocks.sent.push(event);
            }
          });

        for (
          const callId
          of [
            "call_a",
            "call_b"
          ]
        ) {
          await protocol.handle({
            type:
              "response.event",
            delegation_id:
              "delegation_1",
            event: {
              type:
                "response.output_item.done",
              response_id:
                "response_1",
              item: {
                type:
                  "function_call",
                call_id:
                  callId,
                name:
                  "customer_lookup",
                arguments:
                  JSON.stringify({
                    query:
                      "Belgin"
                  })
              }
            }
          });
        }

        expect(
          mocks.sent
        ).toHaveLength(0);

        await protocol.handle(
          completed()
        );

        expect(
          mocks.executeMetrixBusinessTool
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.sent.filter(
            (
              item:
                any
            ) =>
              item?.type ===
                "response.item.create"
          )
        ).toHaveLength(2);

        expect(
          mocks.sent.filter(
            (
              item:
                any
            ) =>
              item?.type ===
                "response.create"
          )
        ).toHaveLength(1);
      }
    );
  }
);

describe(
  "response.failed safety boundary",
  () => {
    it(
      "terminates privileged work after response.failed",
      async () => {
        vi.clearAllMocks();
        mocks.sent.length = 0;

        const {
          createLiveSidebandProtocol
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        mocks.executeMetrixBusinessTool
          .mockResolvedValue({
            action:
              "task.create",
            status:
              "VERIFIED",
            verified:
              true
          });

        const protocol =
          createLiveSidebandProtocol({
            binding,
            auth,
            send(event) {
              mocks.sent.push(event);
            }
          });

        await protocol.handle({
          type:
            "response.event",
          delegation_id:
            "delegation_failed_1",
          event: {
            type:
              "response.failed",
            response: {
              id:
                "response_failed_1"
            }
          }
        });

        await protocol.handle({
          type:
            "response.event",
          delegation_id:
            "delegation_failed_1",
          event: {
            type:
              "response.output_item.done",
            response_id:
              "response_failed_1",
            item: {
              type:
                "function_call",
              call_id:
                "call_after_failure_1",
              name:
                "task_create",
              arguments:
                JSON.stringify({
                  title:
                    "Çalışmaması gereken görev",
                  priority:
                    "HIGH"
                })
            }
          }
        });

        await protocol.handle({
          type:
            "response.event",
          delegation_id:
            "delegation_failed_1",
          event: {
            type:
              "response.completed",
            response: {
              id:
                "response_failed_1"
            }
          }
        });

        expect(
          mocks.executeMetrixBusinessTool
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent
        ).toEqual([]);

        expect(
          mocks.recordLiveLifecycle
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            bindingId:
              binding.id,
            responseId:
              "response_failed_1",
            phase:
              "RESPONSE",
            status:
              "FAILED"
          })
        );
      }
    );
  }
);

describe(
  "trusted Live sideband connection lifecycle",
  () => {
    it(
      "sideband OPEN persists trusted attachment",
      async () => {
        vi.resetModules();

        const listeners =
          new Map<
            string,
            (...args: unknown[]) => void
          >();

        const socketListeners =
          new Map<
            string,
            (...args: unknown[]) => void
          >();

        const markAttached =
          vi.fn().mockResolvedValue({
            id: "binding_1"
          });

        vi.doMock(
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
              markLiveSidebandAttached:
                markAttached
            };
          }
        );

        vi.doMock(
          "openai",
          () => ({
            default:
              class FakeOpenAI {}
          })
        );

        vi.doMock(
          "openai/resources/live/sideband/ws",
          () => ({
            SidebandWS:
              class FakeSidebandWS {
                socket = {
                  on(
                    name: string,
                    handler:
                      (...args: unknown[]) =>
                        void
                  ) {
                    socketListeners.set(
                      name,
                      handler
                    );
                  }
                };

                on(
                  name: string,
                  handler:
                    (...args: unknown[]) =>
                      void
                ) {
                  listeners.set(
                    name,
                    handler
                  );
                }

                send() {}

                close() {}
              }
          })
        );

        const {
          attachLiveSideband
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const binding = {
          id:
            "binding_1",
          openAiSessionId:
            "live_session_1",
          userId:
            "user_1",
          organizationId:
            "org_1",
          status:
            "CONNECTED" as const,
          createdAt:
            new Date(
              "2026-09-14T07:00:00.000Z"
            ),
          connectedAt:
            new Date(
              "2026-09-14T07:00:01.000Z"
            ),
          sidebandAttachedAt:
            null,
          endedAt:
            null,
          failureCode:
            null
        };

        const auth = {
          actorUserId:
            "user_1",
          organizationId:
            "org_1",
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-14T07:50:00.000Z"
        };

        attachLiveSideband({
          binding,
          auth
        });

        const open =
          socketListeners.get(
            "open"
          );

        expect(open).toBeDefined();

        await open?.();

        expect(
          markAttached
        ).toHaveBeenCalledTimes(1);

        expect(
          markAttached
        ).toHaveBeenCalledWith({
          bindingId:
            "binding_1"
        });
      }
    );
  }
);

describe(
  "trusted Live sideband terminal lifecycle",
  () => {
    it(
      "sideband ERROR remains FAILED when CLOSE follows",
      async () => {
        vi.resetModules();

        const listeners =
          new Map<
            string,
            (...args: unknown[]) => void
          >();

        const socketListeners =
          new Map<
            string,
            (...args: unknown[]) => void
          >();

        const markAttached =
          vi.fn().mockResolvedValue({
            id: "binding_1"
          });

        const markFailed =
          vi.fn().mockResolvedValue({
            id: "binding_1",
            status: "FAILED"
          });

        const markDisconnected =
          vi.fn().mockResolvedValue({
            id: "binding_1",
            status: "DISCONNECTED"
          });

        vi.doMock(
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
              markLiveSidebandAttached:
                markAttached,
              markLiveSessionFailed:
                markFailed,
              markLiveSessionDisconnected:
                markDisconnected
            };
          }
        );

        vi.doMock(
          "openai",
          () => ({
            default:
              class FakeOpenAI {}
          })
        );

        vi.doMock(
          "openai/resources/live/sideband/ws",
          () => ({
            SidebandWS:
              class FakeSidebandWS {
                socket = {
                  on(
                    name: string,
                    handler:
                      (...args: unknown[]) =>
                        void
                  ) {
                    socketListeners.set(
                      name,
                      handler
                    );
                  }
                };

                on(
                  name: string,
                  handler:
                    (...args: unknown[]) =>
                      void
                ) {
                  listeners.set(
                    name,
                    handler
                  );
                }

                send() {}

                close() {}
              }
          })
        );

        const {
          attachLiveSideband
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const binding = {
          id:
            "binding_1",
          openAiSessionId:
            "live_session_1",
          userId:
            "user_1",
          organizationId:
            "org_1",
          status:
            "CONNECTED" as const,
          createdAt:
            new Date(
              "2026-09-14T07:00:00.000Z"
            ),
          connectedAt:
            new Date(
              "2026-09-14T07:00:01.000Z"
            ),
          sidebandAttachedAt:
            null,
          endedAt:
            null,
          failureCode:
            null
        };

        const auth = {
          actorUserId:
            "user_1",
          organizationId:
            "org_1",
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-14T07:50:00.000Z"
        };

        attachLiveSideband({
          binding,
          auth
        });

        const error =
          listeners.get(
            "error"
          );

        const close =
          listeners.get(
            "close"
          );

        expect(error).toBeDefined();
        expect(close).toBeDefined();

        await error?.(
          new Error(
            "simulated sideband failure"
          )
        );

        await close?.();

        expect(
          markFailed
        ).toHaveBeenCalledTimes(1);

        expect(
          markFailed
        ).toHaveBeenCalledWith({
          bindingId:
            "binding_1",
          failureCode:
            "LIVE_SIDEBAND_FAILED"
        });

        expect(
          markDisconnected
        ).not.toHaveBeenCalled();
      }
    );
  }
);

describe(
  "trusted Live sideband normal close lifecycle",
  () => {
    it(
      "normal sideband CLOSE persists DISCONNECTED",
      async () => {
        vi.resetModules();

        const listeners =
          new Map<
            string,
            (...args: unknown[]) => void
          >();

        const socketListeners =
          new Map<
            string,
            (...args: unknown[]) => void
          >();

        const markAttached =
          vi.fn().mockResolvedValue({
            id: "binding_1"
          });

        const markFailed =
          vi.fn().mockResolvedValue({
            id: "binding_1",
            status: "FAILED"
          });

        const markDisconnected =
          vi.fn().mockResolvedValue({
            id: "binding_1",
            status: "DISCONNECTED"
          });

        vi.doMock(
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
              markLiveSidebandAttached:
                markAttached,
              markLiveSessionFailed:
                markFailed,
              markLiveSessionDisconnected:
                markDisconnected
            };
          }
        );

        vi.doMock(
          "openai",
          () => ({
            default:
              class FakeOpenAI {}
          })
        );

        vi.doMock(
          "openai/resources/live/sideband/ws",
          () => ({
            SidebandWS:
              class FakeSidebandWS {
                socket = {
                  on(
                    name: string,
                    handler:
                      (...args: unknown[]) =>
                        void
                  ) {
                    socketListeners.set(
                      name,
                      handler
                    );
                  }
                };

                on(
                  name: string,
                  handler:
                    (...args: unknown[]) =>
                      void
                ) {
                  listeners.set(
                    name,
                    handler
                  );
                }

                send() {}

                close() {}
              }
          })
        );

        const {
          attachLiveSideband
        } =
          await import(
            "../../src/lib/live/live-sideband-service"
          );

        const binding = {
          id:
            "binding_1",
          openAiSessionId:
            "live_session_1",
          userId:
            "user_1",
          organizationId:
            "org_1",
          status:
            "CONNECTED" as const,
          createdAt:
            new Date(
              "2026-09-14T07:00:00.000Z"
            ),
          connectedAt:
            new Date(
              "2026-09-14T07:00:01.000Z"
            ),
          sidebandAttachedAt:
            null,
          endedAt:
            null,
          failureCode:
            null
        };

        const auth = {
          actorUserId:
            "user_1",
          organizationId:
            "org_1",
          timezone:
            "Europe/Istanbul",
          referenceTimeIso:
            "2026-09-14T07:50:00.000Z"
        };

        attachLiveSideband({
          binding,
          auth
        });

        const close =
          listeners.get(
            "close"
          );

        expect(close).toBeDefined();

        await close?.();

        expect(
          markFailed
        ).not.toHaveBeenCalled();

        expect(
          markDisconnected
        ).toHaveBeenCalledTimes(1);

        expect(
          markDisconnected
        ).toHaveBeenCalledWith({
          bindingId:
            "binding_1"
        });
      }
    );
  }
);


describe(
  "trusted Live sideband failure matrix",
  () => {
    async function createProtocolForFailureMatrix() {
      vi.clearAllMocks();
      mocks.sent.length = 0;

      const {
        createLiveSidebandProtocol
      } =
        await import(
          "../../src/lib/live/live-sideband-service"
        );

      const binding = {
        id:
          "binding_failure_matrix",
        openAiSessionId:
          "live_failure_matrix",
        userId:
          "user_1",
        organizationId:
          "org_1",
        status:
          "CONNECTED",
        createdAt:
          new Date(),
        connectedAt:
          new Date(),
        sidebandAttachedAt:
          new Date(),
        endedAt:
          null,
        failureCode:
          null
      } as const;

      const auth = {
        actorUserId:
          "user_1",
        organizationId:
          "org_1",
        timezone:
          "Europe/Istanbul",
        referenceTimeIso:
          "2026-09-14T12:00:00+03:00"
      };

      const protocol =
        createLiveSidebandProtocol({
          binding,
          auth,
          send(event: unknown) {
            mocks.sent.push(event);
          }
        });

      return protocol;
    }

    function functionCall(
      input: {
        callId: string;
        name: string;
        argumentsJson: string;
      }
    ) {
      return {
        type:
          "response.event",
        delegation_id:
          "delegation_failure_matrix",
        event: {
          type:
            "response.output_item.done",
          response_id:
            "response_failure_matrix",
          item: {
            type:
              "function_call",
            call_id:
              input.callId,
            name:
              input.name,
            arguments:
              input.argumentsJson
          }
        }
      };
    }

    function completed() {
      return {
        type:
          "response.event",
        delegation_id:
          "delegation_failure_matrix",
        event: {
          type:
            "response.completed",
          response: {
            id:
              "response_failure_matrix"
          }
        }
      };
    }

    it(
      "returns UNKNOWN_TOOL without executing business runtime",
      async () => {
        const protocol =
          await createProtocolForFailureMatrix();

        await protocol.handle(
          functionCall({
            callId:
              "call_unknown",
            name:
              "not_a_real_metrix_tool",
            argumentsJson:
              "{}"
          })
        );

        await protocol.handle(
          completed()
        );

        expect(
          mocks.executeMetrixBusinessTool
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent
        ).toHaveLength(2);

        expect(
          mocks.sent[0]
        ).toMatchObject({
          type:
            "response.item.create",
          item: {
            type:
              "function_call_output",
            call_id:
              "call_unknown",
            output:
              JSON.stringify({
                ok:
                  false,
                code:
                  "UNKNOWN_TOOL"
              })
          }
        });
      }
    );

    it(
      "returns INVALID_TOOL_ARGUMENTS without executing business runtime",
      async () => {
        const protocol =
          await createProtocolForFailureMatrix();

        await protocol.handle(
          functionCall({
            callId:
              "call_bad_json",
            name:
              "task_create",
            argumentsJson:
              "{not-json"
          })
        );

        await protocol.handle(
          completed()
        );

        expect(
          mocks.executeMetrixBusinessTool
        ).not.toHaveBeenCalled();

        expect(
          mocks.sent[0]
        ).toMatchObject({
          type:
            "response.item.create",
          item: {
            type:
              "function_call_output",
            call_id:
              "call_bad_json",
            output:
              JSON.stringify({
                ok:
                  false,
                code:
                  "INVALID_TOOL_ARGUMENTS"
              })
          }
        });
      }
    );

    it(
      "returns TOOL_EXECUTION_FAILED when canonical runtime rejects",
      async () => {
        mocks.executeMetrixBusinessTool
          .mockRejectedValueOnce(
            new Error(
              "deterministic runtime rejected"
            )
          );

        const protocol =
          await createProtocolForFailureMatrix();

        await protocol.handle(
          functionCall({
            callId:
              "call_runtime_failure",
            name:
              "task_create",
            argumentsJson:
              JSON.stringify({
                title:
                  "Failure matrix"
              })
          })
        );

        await protocol.handle(
          completed()
        );

        expect(
          mocks.executeMetrixBusinessTool
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.executeMetrixBusinessTool
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            context:
              expect.objectContaining({
                actorUserId:
                  "user_1",
                organizationId:
                  "org_1",
                timezone:
                  "Europe/Istanbul",
                referenceTimeIso:
                  "2026-09-14T12:00:00+03:00",
                idempotencyScope:
                  "live:binding_failure_matrix:call:call_runtime_failure"
              })
          })
        );

        expect(
          mocks.sent[0]
        ).toMatchObject({
          type:
            "response.item.create",
          item: {
            type:
              "function_call_output",
            call_id:
              "call_runtime_failure",
            output:
              JSON.stringify({
                ok:
                  false,
                code:
                  "TOOL_EXECUTION_FAILED"
              })
          }
        });
      }
    );
  }
);
