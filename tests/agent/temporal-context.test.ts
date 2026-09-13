import {
  describe,
  expect,
  it
} from "vitest";

import {
  createMetrixExecutiveAgent
} from "../../src/lib/agent/metrix-executive-agent";

describe(
  "trusted temporal context",
  () => {
    it(
      "grounds relative-time interpretation in server reference time and user timezone",
      () => {
        const agent =
          createMetrixExecutiveAgent({
            timezone:
              "Europe/Istanbul",
            referenceTimeIso:
              "2026-09-13T17:30:00.000Z"
          });

        const instructions =
          String(
            agent.instructions
          );

        expect(
          instructions
        ).toContain(
          "2026-09-13T17:30:00.000Z"
        );

        expect(
          instructions
        ).toContain(
          "Europe/Istanbul"
        );

        expect(
          instructions
        ).toContain(
          "yarın"
        );

        expect(
          instructions
        ).toContain(
          "dueAt"
        );

        expect(
          instructions
        ).toContain(
          "ISO 8601"
        );
      }
    );

    it(
      "does not invent a temporal reference when constructing the reusable base agent",
      () => {
        const agent =
          createMetrixExecutiveAgent();

        const instructions =
          String(
            agent.instructions
          );

        expect(
          instructions
        ).not.toContain(
          "Trusted server time context"
        );
      }
    );
  }
);
