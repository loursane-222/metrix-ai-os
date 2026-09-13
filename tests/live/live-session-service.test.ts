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
            type: "responses",
            responses: {
              model: "gpt-5.6-sol",
              tool_choice: "auto"
            }
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

      expect(result).toEqual({
        bindingId: "binding_1",
        answerSdp:
          "v=0\r\nanswer",
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
