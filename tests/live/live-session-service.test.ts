import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const {
  liveCreateMock,
  createBindingMock,
  bindSessionMock,
  markFailedMock
} = vi.hoisted(() => ({
  liveCreateMock: vi.fn(),
  createBindingMock: vi.fn(),
  bindSessionMock: vi.fn(),
  markFailedMock: vi.fn()
}));


const sidebandMocks =
  vi.hoisted(() => ({
    attachLiveSideband:
      vi.fn(() => ({
        close:
          vi.fn()
      }))
  }));

vi.mock(
  "../../src/lib/live/live-sideband-service",
  () => ({
    attachLiveSideband:
      sidebandMocks.attachLiveSideband
  })
);

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      live = {
        create: liveCreateMock
      };
    }
  };
});

vi.mock(
  "../../src/lib/live/live-session-store",
  () => ({
    createLiveSessionBinding:
      createBindingMock,

    bindOpenAiLiveSession:
      bindSessionMock,

    markLiveSessionFailed:
      markFailedMock
  })
);

import {
  bootstrapLiveSession
} from "../../src/lib/live/live-session-service";

const auth = {
  actorUserId: "user_test",
  organizationId: "org_test",
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-14T00:30:00.000Z"
};

describe("bootstrapLiveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createBindingMock.mockResolvedValue({
      id: "binding_1",
      openAiSessionId: null,
      userId: auth.actorUserId,
      organizationId:
        auth.organizationId,
      status: "BOOTSTRAPPING",
      createdAt: new Date(
        "2026-09-14T00:30:00.000Z"
      ),
      connectedAt: null,
      sidebandAttachedAt: null,
      endedAt: null,
      failureCode: null
    });

    bindSessionMock.mockResolvedValue({
      id: "binding_1",
      openAiSessionId:
        "live_session_opaque_1",
      userId: auth.actorUserId,
      organizationId:
        auth.organizationId,
      status: "CONNECTED",
      createdAt: new Date(
        "2026-09-14T00:30:00.000Z"
      ),
      connectedAt: new Date(
        "2026-09-14T00:30:01.000Z"
      ),
      sidebandAttachedAt: null,
      endedAt: null,
      failureCode: null
    });

    markFailedMock.mockResolvedValue({
      id: "binding_1",
      openAiSessionId: null,
      userId: auth.actorUserId,
      organizationId:
        auth.organizationId,
      status: "FAILED",
      createdAt: new Date(
        "2026-09-14T00:30:00.000Z"
      ),
      connectedAt: null,
      sidebandAttachedAt: null,
      endedAt: new Date(
        "2026-09-14T00:30:01.000Z"
      ),
      failureCode:
        "LIVE_SESSION_CREATE_FAILED"
    });
  });

  it(
    "rejects an empty SDP before creating a binding or Live session",
    async () => {
      await expect(
        bootstrapLiveSession({
          sdp: "",
          auth
        })
      ).rejects.toMatchObject({
        code: "INVALID_SDP"
      });

      expect(
        createBindingMock
      ).not.toHaveBeenCalled();

      expect(
        liveCreateMock
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "creates the trusted binding, persists the opaque OpenAI session ID, and returns only the browser-safe contract",
    async () => {
      liveCreateMock.mockResolvedValue({
        session: {
          id: "live_session_opaque_1"
        },
        transport: {
          type: "webrtc",
          sdp: "v=0\r\nanswer"
        }
      });

      const result =
        await bootstrapLiveSession({
          sdp: "v=0\r\noffer",
          auth
        });

      expect(
        createBindingMock
      ).toHaveBeenCalledWith({
        actorUserId:
          auth.actorUserId,
        organizationId:
          auth.organizationId
      });

      expect(
        liveCreateMock
      ).toHaveBeenCalledTimes(1);

      const request =
        liveCreateMock.mock.calls[0]?.[0];

      expect(request).toMatchObject({
        session: {
          model: "gpt-live-1",
          delegation: {
            type: "client"
          }
        },
        transport: {
          type: "webrtc",
          sdp: "v=0\r\noffer"
        }
      });

      expect(
        bindSessionMock
      ).toHaveBeenCalledWith({
        bindingId: "binding_1",
        openAiSessionId:
          "live_session_opaque_1"
      });

            expect(
        sidebandMocks.attachLiveSideband
      ).toHaveBeenCalledTimes(1);

      expect(
        sidebandMocks.attachLiveSideband
      ).toHaveBeenCalledWith({
        binding:
          expect.objectContaining({
            id:
              expect.any(String),
            openAiSessionId:
              expect.any(String)
          }),
        auth:
          expect.objectContaining({
            actorUserId:
              expect.any(String),
            organizationId:
              expect.any(String),
            timezone:
              expect.any(String),
            referenceTimeIso:
              expect.any(String)
          })
      });

expect(result).toEqual({
        bindingId: "binding_1",
        answerSdp:
          "v=0\r\nanswer\r\n",
        voice: "marin"
      });

      expect(
        Object.keys(result).sort()
      ).toEqual([
        "answerSdp",
        "bindingId",
        "voice"
      ]);

      expect(
        markFailedMock
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "preserves the terminal CRLF in a browser SDP offer sent to OpenAI",
    async () => {
      liveCreateMock.mockResolvedValue({
        session: {
          id: "live_session_opaque_1"
        },
        transport: {
          type: "webrtc",
          sdp: "v=0\r\nanswer"
        }
      });

      await bootstrapLiveSession({
        sdp: "v=0\r\noffer\r\n",
        auth
      });

      expect(
        liveCreateMock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: {
            type: "webrtc",
            sdp: "v=0\r\noffer\r\n"
          }
        })
      );
    }
  );

  it(
    "appends a missing terminal CRLF to the OpenAI answer SDP so the browser's native WebRTC parser accepts it",
    async () => {
      liveCreateMock.mockResolvedValue({
        session: {
          id: "live_session_opaque_1"
        },
        transport: {
          type: "webrtc",
          sdp:
            "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:abc\r\na=ice-pwd:def"
        }
      });

      const result =
        await bootstrapLiveSession({
          sdp: "v=0\r\noffer",
          auth
        });

      expect(
        result.answerSdp.endsWith(
          "\r\n"
        )
      ).toBe(true);

      expect(
        result.answerSdp
      ).toBe(
        "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:abc\r\na=ice-pwd:def\r\n"
      );
    }
  );

  it(
    "does not duplicate an already-terminated OpenAI answer SDP",
    async () => {
      liveCreateMock.mockResolvedValue({
        session: {
          id: "live_session_opaque_1"
        },
        transport: {
          type: "webrtc",
          sdp: "v=0\r\nanswer\r\n"
        }
      });

      const result =
        await bootstrapLiveSession({
          sdp: "v=0\r\noffer",
          auth
        });

      expect(
        result.answerSdp
      ).toBe(
        "v=0\r\nanswer\r\n"
      );
    }
  );

  it(
    "marks the trusted binding failed when OpenAI Live creation fails",
    async () => {
      liveCreateMock.mockRejectedValue(
        new Error(
          "simulated upstream failure"
        )
      );

      await expect(
        bootstrapLiveSession({
          sdp: "v=0\r\noffer",
          auth
        })
      ).rejects.toMatchObject({
        code:
          "LIVE_SESSION_CREATE_FAILED"
      });

      expect(
        createBindingMock
      ).toHaveBeenCalledTimes(1);

      expect(
        bindSessionMock
      ).not.toHaveBeenCalled();

      expect(
        markFailedMock
      ).toHaveBeenCalledWith({
        bindingId: "binding_1",
        failureCode:
          "LIVE_SESSION_CREATE_FAILED"
      });
    }
  );
});

describe(
  "trusted Live sideband readiness boundary",
  () => {
    it(
      "does not return browser SDP before trusted sideband is ready",
      async () => {
        vi.resetModules();

        let resolveReady:
          (() => void) | undefined;

        const ready =
          new Promise<void>(
            resolve => {
              resolveReady =
                resolve;
            }
          );

        let signalAttached:
          (() => void) | undefined;

        const attached =
          new Promise<void>(
            resolve => {
              signalAttached =
                resolve;
            }
          );

        const createBinding =
          vi.fn().mockResolvedValue({
            id:
              "binding_readiness_1",
            openAiSessionId:
              null,
            userId:
              "user_1",
            organizationId:
              "org_1",
            status:
              "BOOTSTRAPPING",
            createdAt:
              new Date(),
            connectedAt:
              null,
            sidebandAttachedAt:
              null,
            endedAt:
              null,
            failureCode:
              null
          });

        const bindSession =
          vi.fn().mockResolvedValue({
            id:
              "binding_readiness_1",
            openAiSessionId:
              "live_readiness_1",
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
              null,
            endedAt:
              null,
            failureCode:
              null
          });

        const markFailed =
          vi.fn();

        const attach =
          vi.fn(
            () => {
              signalAttached?.();

              return {
                close:
                  vi.fn(),
                ready
              };
            }
          );

        vi.doMock(
          "../../src/lib/live/live-session-store",
          () => ({
            createLiveSessionBinding:
              createBinding,
            bindOpenAiLiveSession:
              bindSession,
            markLiveSessionFailed:
              markFailed
          })
        );

        vi.doMock(
          "../../src/lib/live/live-sideband-service",
          () => ({
            attachLiveSideband:
              attach
          })
        );

        vi.doMock(
          "../../src/lib/live/live-session-config",
          () => ({
            METRIX_LIVE_VOICE:
              "marin",
            buildLiveSessionConfig:
              vi.fn(
                () => ({
                  type:
                    "live",
                  model:
                    "gpt-live-1"
                })
              )
          })
        );

        vi.doMock(
          "openai",
          () => ({
            default:
              class FakeOpenAI {
                live = {
                  create:
                    vi.fn().mockResolvedValue({
                      session: {
                        id:
                          "live_readiness_1"
                      },
                      transport: {
                        sdp:
                          "v=0\r\nanswer"
                      }
                    })
                };
              }
          })
        );

        const {
          bootstrapLiveSession
        } =
          await import(
            "../../src/lib/live/live-session-service"
          );

        const bootstrap =
          bootstrapLiveSession({
            sdp:
              "v=0\r\noffer",
            auth: {
              actorUserId:
                "user_1",
              organizationId:
                "org_1",
              timezone:
                "Europe/Istanbul",
              referenceTimeIso:
                "2026-09-14T12:15:00+03:00"
            }
          });

        await attached;

        let settled =
          false;

        void bootstrap.finally(
          () => {
            settled =
              true;
          }
        );

        await new Promise<void>(
          resolve => {
            setImmediate(
              resolve
            );
          }
        );

        expect(
          attach
        ).toHaveBeenCalledTimes(1);

        expect(
          settled
        ).toBe(
          false
        );

        resolveReady?.();

        await expect(
          bootstrap
        ).resolves.toEqual({
          bindingId:
            "binding_readiness_1",
          answerSdp:
            "v=0\r\nanswer\r\n",
          voice:
            "marin"
        });
      }
    );
  }
);

describe(
  "trusted Live sideband bounded readiness",
  () => {
    it(
      "rejects bootstrap when trusted sideband never becomes ready",
      async () => {
        vi.resetModules();
        vi.useFakeTimers();

        try {
          const neverReady =
            new Promise<void>(
              () => undefined
            );

          const createBinding =
            vi.fn().mockResolvedValue({
              id:
                "binding_timeout_1",
              openAiSessionId:
                null,
              userId:
                "user_1",
              organizationId:
                "org_1",
              status:
                "BOOTSTRAPPING",
              createdAt:
                new Date(),
              connectedAt:
                null,
              sidebandAttachedAt:
                null,
              endedAt:
                null,
              failureCode:
                null
            });

          const bindSession =
            vi.fn().mockResolvedValue({
              id:
                "binding_timeout_1",
              openAiSessionId:
                "live_timeout_1",
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
                null,
              endedAt:
                null,
              failureCode:
                null
            });

          const markFailed =
            vi.fn().mockResolvedValue({
              id:
                "binding_timeout_1",
              status:
                "FAILED"
            });

          vi.doMock(
            "../../src/lib/live/live-session-store",
            () => ({
              createLiveSessionBinding:
                createBinding,
              bindOpenAiLiveSession:
                bindSession,
              markLiveSessionFailed:
                markFailed
            })
          );

          vi.doMock(
            "../../src/lib/live/live-sideband-service",
            () => ({
              attachLiveSideband:
                vi.fn(
                  () => ({
                    close:
                      vi.fn(),
                    ready:
                      neverReady
                  })
                )
            })
          );

          vi.doMock(
            "../../src/lib/live/live-session-config",
            () => ({
              METRIX_LIVE_VOICE:
                "marin",
              buildLiveSessionConfig:
                vi.fn(
                  () => ({
                    type:
                      "live",
                    model:
                      "gpt-live-1"
                  })
                )
            })
          );

          vi.doMock(
            "openai",
            () => ({
              default:
                class FakeOpenAI {
                  live = {
                    create:
                      vi.fn().mockResolvedValue({
                        session: {
                          id:
                            "live_timeout_1"
                        },
                        transport: {
                          sdp:
                            "v=0\r\nanswer"
                        }
                      })
                  };
                }
            })
          );

          const {
            bootstrapLiveSession
          } =
            await import(
              "../../src/lib/live/live-session-service"
            );

          const bootstrap =
            bootstrapLiveSession({
              sdp:
                "v=0\r\noffer",
              auth: {
                actorUserId:
                  "user_1",
                organizationId:
                  "org_1",
                timezone:
                  "Europe/Istanbul",
                referenceTimeIso:
                  "2026-09-14T12:22:00+03:00"
              }
            });

          let settled =
            false;

          let rejected =
            false;

          void bootstrap.then(
            () => {
              settled =
                true;
            },
            () => {
              settled =
                true;
              rejected =
                true;
            }
          );

          await vi.advanceTimersByTimeAsync(
            30000
          );

          await Promise.resolve();

          expect(
            settled
          ).toBe(
            true
          );

          expect(
            rejected
          ).toBe(
            true
          );

          expect(
            markFailed
          ).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      }
    );
  }
);
