export type VoiceSessionState =
  | {
      phase: "idle";
    }
  | {
      phase: "requesting_microphone";
    }
  | {
      phase: "negotiating";
    }
  | {
      phase: "connected";
    }
  | {
      phase: "recoverable_error";
      code:
        | "MICROPHONE_DENIED"
        | "CONNECTION_FAILED";
    }
  | {
      phase: "closed";
    };

export type VoiceSessionEvent =
  | {
      type: "START_REQUESTED";
    }
  | {
      type: "MICROPHONE_READY";
    }
  | {
      type: "CONNECTION_READY";
    }
  | {
      type: "MICROPHONE_DENIED";
    }
  | {
      type: "CONNECTION_FAILED";
    }
  | {
      type: "STOP_REQUESTED";
    };

export function reduceVoiceSessionState(
  state: VoiceSessionState,
  event: VoiceSessionEvent
): VoiceSessionState {
  switch (event.type) {
    case "START_REQUESTED":
      return {
        phase: "requesting_microphone"
      };

    case "MICROPHONE_READY":
      return {
        phase: "negotiating"
      };

    case "CONNECTION_READY":
      return {
        phase: "connected"
      };

    case "MICROPHONE_DENIED":
      return {
        phase: "recoverable_error",
        code: "MICROPHONE_DENIED"
      };

    case "CONNECTION_FAILED":
      return {
        phase: "recoverable_error",
        code: "CONNECTION_FAILED"
      };

    case "STOP_REQUESTED":
      return {
        phase: "closed"
      };

    default:
      return state;
  }
}
