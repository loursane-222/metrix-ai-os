import {
  existsSync,
  readFileSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

const clientPath =
  join(
    process.cwd(),
    "src/app/voice/voice-session-client.tsx"
  );

const pagePath =
  join(
    process.cwd(),
    "src/app/voice/page.tsx"
  );

const clientExists =
  existsSync(
    clientPath
  );

const pageExists =
  existsSync(
    pagePath
  );

describe(
  "voice browser trust boundary",
  () => {
    it(
      "requires the minimal browser voice surface",
      () => {
        expect(
          clientExists
        ).toBe(true);

        expect(
          pageExists
        ).toBe(true);
      }
    );

    it(
      "uses direct browser WebRTC and the authenticated bootstrap endpoint",
      () => {
        expect(
          clientExists
        ).toBe(true);

        if (!clientExists) {
          return;
        }

        const source =
          readFileSync(
            clientPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "RTCPeerConnection"
        );

        expect(
          source
        ).toContain(
          "getUserMedia"
        );

        expect(
          source
        ).toContain(
          '"/api/metrix/live/session"'
        );

        expect(
          source
        ).toContain(
          "answerSdp"
        );
      }
    );

    it(
      "sends only SDP to the METRIX Live bootstrap route",
      () => {
        expect(
          clientExists
        ).toBe(true);

        if (!clientExists) {
          return;
        }

        const source =
          readFileSync(
            clientPath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /JSON\.stringify\s*\(\s*\{\s*sdp\s*[,}]/
        );

        expect(
          source
        ).not.toMatch(
          /actorUserId|organizationId|referenceTimeIso|idempotencyKey/
        );
      }
    );

    it(
      "keeps server secrets and business authority out of the browser",
      () => {
        expect(
          clientExists
        ).toBe(true);

        if (!clientExists) {
          return;
        }

        const source =
          readFileSync(
            clientPath,
            "utf8"
          );

        expect(
          source
        ).not.toMatch(
          /OPENAI_API_KEY|client\.live\.create|SidebandWS|executeMetrixBusinessTool|response\.item\.create|function_call_output/
        );
      }
    );

    it(
      "owns microphone input remote audio and the allowed data channel only",
      () => {
        expect(
          clientExists
        ).toBe(true);

        if (!clientExists) {
          return;
        }

        const source =
          readFileSync(
            clientPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          'createDataChannel("oai-events")'
        );

        expect(
          source
        ).toMatch(
          /<audio[\s\S]*autoPlay/
        );

        expect(
          source
        ).not.toMatch(
          /speechSynthesis|MediaRecorder|AudioContext|ScriptProcessorNode|AudioWorklet/
        );
      }
    );

    it(
      "does not introduce forbidden product scope",
      () => {
        expect(
          clientExists
        ).toBe(true);

        if (!clientExists) {
          return;
        }

        const source =
          readFileSync(
            clientPath,
            "utf8"
          );

        expect(
          source
        ).not.toMatch(
          /voice selector|transcript history|debug log|custom vad/i
        );
      }
    );
  }
);
