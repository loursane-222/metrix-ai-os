import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildLiveSessionConfig
} from "../../src/lib/live/live-session-config";

describe("buildLiveSessionConfig", () => {
  it("builds the frozen Live-1 → Sol delegation contract", () => {
    const referenceTimeIso =
      "2026-09-14T00:30:00.000Z";

    const config = buildLiveSessionConfig({
      timezone: "Europe/Istanbul",
      referenceTimeIso,
      voice: "marin"
    });

    expect(config.model).toBe("gpt-live-1");

    expect(config.delegation).toMatchObject({
      type: "responses",
      responses: {
        model: "gpt-5.6-sol",
        tool_choice: "auto"
      }
    });

    const serialized = JSON.stringify(config);

    expect(serialized).toContain("task_create");
    expect(serialized).toContain("customer_create");
    expect(serialized).toContain("customer_lookup");

    expect(serialized).not.toContain("OPENAI_API_KEY");

    expect(serialized).not.toContain(
      "response.item.create"
    );

    expect(serialized).not.toContain(
      '"response.create"'
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
});
