import {
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

const clientPath =
  "src/app/voice/voice-session-client.tsx";

const conversationPath =
  "src/components/metrix-conversation/MetrixConversation.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// Regression coverage for the actual root cause behind "server published
// the result, browser never showed anything": the standalone /voice
// trust-boundary test page and the main /metrix composer's mic button
// share useVoiceSession's transport-only resultDelivery state, but only
// one of the two ever rendered it anywhere — a real, server-confirmed
// delivery had nowhere to go for the other. Both now render through the
// exact same generic MetrixViewSurface the text turn already uses, never
// a second, voice-only presentation surface.
describe(
  "both the standalone /voice page and /metrix's MetrixConversation render Live delivery through the same generic MetrixViewSurface",
  () => {
    it(
      "the standalone /voice page renders MetrixViewSurface, not a bare <main> with no result surface",
      () => {
        const source = read(clientPath);

        expect(source).toContain("MetrixViewSurface");

        const bodyStart = source.indexOf(
          "function VoiceSessionClientBody"
        );

        expect(bodyStart).toBeGreaterThan(-1);

        const body = source.slice(bodyStart);

        expect(body).toContain("<MetrixViewSurface");
      }
    );

    it(
      "applies a newer delivered TurnResult's presentation into local state, content-blind, reacting only to resultDelivery.version",
      () => {
        const source = read(clientPath);

        const bodyStart = source.indexOf(
          "function VoiceSessionClientBody"
        );

        expect(bodyStart).toBeGreaterThan(-1);

        const body = source.slice(bodyStart);

        expect(body).toContain("resultDelivery");
        expect(body).toContain("setPresentation");

        expect(body).toMatch(
          /\[\s*resultDelivery\.version\s*\]/
        );
      }
    );

    it(
      "MetrixConversation applies the same voice resultDelivery into the exact presentation state its own text turn already sets",
      () => {
        const source = read(conversationPath);

        expect(source).toContain("MetrixViewSurface");
        expect(source).toContain("voice.resultDelivery");
        expect(source).toContain("setPresentation");

        expect(source).toMatch(
          /\[\s*voice\.resultDelivery\.version\s*\]/
        );

        // Exactly one presentation surface in this component — the text
        // path and the voice path both feed the same `presentation`
        // state, never two separate renderers.
        const surfaceOccurrences = (
          source.match(/<MetrixViewSurface/g) ?? []
        ).length;

        expect(surfaceOccurrences).toBe(1);
      }
    );

    it(
      "no second, voice-only presentation renderer exists anywhere in the voice client",
      () => {
        const source = read(clientPath);

        expect(source).not.toMatch(
          /function\s+\w*DirectiveSurface|function\s+\w*WorkspaceSurface|function\s+\w*ResultSurface/
        );
      }
    );

    it(
      "renders the Voice trust-boundary UI (mic controls, audio element) in the standalone page",
      () => {
        const source = read(clientPath);

        const bodyStart = source.indexOf(
          "function VoiceSessionClientBody"
        );

        const body = source.slice(bodyStart);

        expect(body).toContain('aria-live="polite"');
        expect(body).toMatch(/<audio[\s\S]*autoPlay/);
      }
    );
  }
);
