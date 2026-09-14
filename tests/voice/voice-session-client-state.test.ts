import {
  existsSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

const implementationPath =
  join(
    process.cwd(),
    "src/app/voice/voice-session-client-state.ts"
  );

const implementationExists =
  existsSync(
    implementationPath
  );

describe(
  "browser voice session state",
  () => {
    it(
      "requires the deterministic voice session reducer",
      () => {
        expect(
          implementationExists
        ).toBe(true);
      }
    );

    it(
      "moves through the canonical connection phases",
      async () => {
        expect(
          implementationExists
        ).toBe(true);

        if (!implementationExists) {
          return;
        }

        const {
          reduceVoiceSessionState
        } =
          await import(
            "../../src/app/voice/voice-session-client-state"
          );

        let state: ReturnType<
          typeof reduceVoiceSessionState
        > =
          {
            phase: "idle"
          };

        state =
          reduceVoiceSessionState(
            state,
            {
              type:
                "START_REQUESTED"
            }
          );

        expect(
          state
        ).toEqual({
          phase:
            "requesting_microphone"
        });

        state =
          reduceVoiceSessionState(
            state,
            {
              type:
                "MICROPHONE_READY"
            }
          );

        expect(
          state
        ).toEqual({
          phase:
            "negotiating"
        });

        state =
          reduceVoiceSessionState(
            state,
            {
              type:
                "CONNECTION_READY"
            }
          );

        expect(
          state
        ).toEqual({
          phase:
            "connected"
        });
      }
    );

    it(
      "turns microphone denial into a recoverable error",
      async () => {
        expect(
          implementationExists
        ).toBe(true);

        if (!implementationExists) {
          return;
        }

        const {
          reduceVoiceSessionState
        } =
          await import(
            "../../src/app/voice/voice-session-client-state"
          );

        expect(
          reduceVoiceSessionState(
            {
              phase:
                "requesting_microphone"
            },
            {
              type:
                "MICROPHONE_DENIED"
            }
          )
        ).toEqual({
          phase:
            "recoverable_error",
          code:
            "MICROPHONE_DENIED"
        });
      }
    );

    it(
      "moves a stopped session to closed",
      async () => {
        expect(
          implementationExists
        ).toBe(true);

        if (!implementationExists) {
          return;
        }

        const {
          reduceVoiceSessionState
        } =
          await import(
            "../../src/app/voice/voice-session-client-state"
          );

        expect(
          reduceVoiceSessionState(
            {
              phase:
                "connected"
            },
            {
              type:
                "STOP_REQUESTED"
            }
          )
        ).toEqual({
          phase:
            "closed"
        });
      }
    );

    it(
      "turns connection failure into a recoverable error",
      async () => {
        expect(
          implementationExists
        ).toBe(true);

        if (!implementationExists) {
          return;
        }

        const {
          reduceVoiceSessionState
        } =
          await import(
            "../../src/app/voice/voice-session-client-state"
          );

        expect(
          reduceVoiceSessionState(
            {
              phase:
                "negotiating"
            },
            {
              type:
                "CONNECTION_FAILED"
            }
          )
        ).toEqual({
          phase:
            "recoverable_error",
          code:
            "CONNECTION_FAILED"
        });
      }
    );
  }
);
