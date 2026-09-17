import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildLiveSessionConfig
} from "../../src/lib/live/live-session-config";

describe("buildLiveSessionConfig", () => {
  it("builds the frozen Live-1 client-delegation contract", () => {
    const referenceTimeIso =
      "2026-09-14T00:30:00.000Z";

    const config = buildLiveSessionConfig({
      timezone: "Europe/Istanbul",
      referenceTimeIso,
      voice: "marin"
    });

    expect(config.model).toBe("gpt-live-1");

    // Client delegation: our own server decides what to do with every
    // session.delegation.created event (live-delegation-bridge.ts) —
    // this session never configures or runs a server-owned Responses
    // conversation at all.
    expect(config.delegation).toEqual({
      type: "client"
    });

    const serialized = JSON.stringify(config);

    expect(serialized).not.toContain("OPENAI_API_KEY");

    // The retired Responses-delegation function-calling protocol never
    // appears in this session's config anymore.
    expect(serialized).not.toContain(
      "response.item.create"
    );

    expect(serialized).not.toContain(
      '"response.create"'
    );

    expect(serialized).not.toContain(
      "gpt-5.6-sol"
    );

    expect(config.client).toMatchObject({
      data_channel: {
        allowed_client_events: [
          "session.close"
        ]
      }
    });

    expect(
      JSON.stringify(
        config.client
      )
    ).not.toContain(
      "response.item.create"
    );

    expect(
      JSON.stringify(
        config.client
      )
    ).not.toContain(
      "instructions.append"
    );
  });

  it("rejects an invalid trusted timezone or reference time", () => {
    expect(() =>
      buildLiveSessionConfig({
        timezone: "  ",
        referenceTimeIso:
          "2026-09-14T00:30:00.000Z",
        voice: "marin"
      })
    ).toThrow(
      "Trusted timezone is required"
    );

    expect(() =>
      buildLiveSessionConfig({
        timezone: "Europe/Istanbul",
        referenceTimeIso:
          "not-a-date",
        voice: "marin"
      })
    ).toThrow(
      "Valid trusted reference time is required"
    );
  });

  it("rejects an unsupported Live voice", () => {
    expect(() =>
      buildLiveSessionConfig({
        timezone: "Europe/Istanbul",
        referenceTimeIso:
          "2026-09-14T00:30:00.000Z",
        voice: "not-marin" as never
      })
    ).toThrow(
      "Unsupported Live voice"
    );
  });
});
