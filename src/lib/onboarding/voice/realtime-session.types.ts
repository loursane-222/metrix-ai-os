export type VoiceDiscoveryState =
  | "idle"
  | "requesting_microphone"
  | "listening"
  | "user_speaking"
  | "thinking"
  | "metrix_speaking"
  | "reconnecting"
  | "error";

export type VoiceDiscoveryRole = "user" | "metrix";

export type VoiceDiscoveryTurn = {
  role: VoiceDiscoveryRole;
  content: string;
};

export type VoiceDiscoveryAnalysis = {
  firstImpression: string;
  reason: string;
  caveat: string;
  focusItems: string[];
  expectedOutcome: string;
};

export type VoiceDiscoveryApiResponse =
  | {
      mode: "CONTINUE_CONVERSATION";
      message: string;
    }
  | ({
      mode: "FINAL_OPINION";
    } & VoiceDiscoveryAnalysis);

export type VoiceDiscoveryTranscriptTurn = {
  id: string;
  content: string;
  isFinal: boolean;
  createdAt: string;
};

export type VoiceControllerEvent =
  | {
      type: "state_changed";
      state: VoiceDiscoveryState;
    }
  | {
      type: "transcript_delta";
      transcript: string;
    }
  | {
      type: "transcript_final";
      transcript: string;
    }
  | {
      type: "metrix_response";
      message: string;
    }
  | {
      type: "final_opinion";
      analysis: VoiceDiscoveryAnalysis;
    }
  | {
      type: "error";
      message: string;
    };

export type VoiceRealtimeClientSecret = {
  value: string;
  expiresAt?: number | null;
};

export type VoiceRealtimeSessionInfo = {
  model: string;
  voice: string;
  turnDetection: "semantic_vad";
  transcription: "enabled";
};

export type VoiceRealtimeSessionResponse = {
  clientSecret: VoiceRealtimeClientSecret;
  session: VoiceRealtimeSessionInfo;
};
