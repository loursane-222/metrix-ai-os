export const CONVERSATION_NEAR_BOTTOM_PX = 120;

export type ConversationViewportDecision =
  | "force-to-latest"
  | "follow-active-message"
  | "preserve-user-position"
  | "no-op";

export type ConversationViewportState = Readonly<{
  activeAssistantGeneration: number | null;
  autoFollow: boolean;
}>;

export type ScrollMetrics = Readonly<{
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}>;

export type ConversationViewportTransition = Readonly<{
  decision: ConversationViewportDecision;
  state: ConversationViewportState;
}>;

export function createConversationViewportState(): ConversationViewportState {
  return { activeAssistantGeneration: null, autoFollow: true };
}

export function isConversationNearBottom(metrics: ScrollMetrics): boolean {
  const distanceFromBottom =
    metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return distanceFromBottom <= CONVERSATION_NEAR_BOTTOM_PX;
}

export function recordConversationScroll(
  state: ConversationViewportState,
  metrics: ScrollMetrics,
): ConversationViewportTransition {
  return {
    decision: "no-op",
    state: { ...state, autoFollow: isConversationNearBottom(metrics) },
  };
}

export function revealLatestUserMessage(
  state: ConversationViewportState,
): ConversationViewportTransition {
  return { decision: "force-to-latest", state };
}

export function startAssistantMessage(
  state: ConversationViewportState,
  generation: number,
): ConversationViewportTransition {
  return {
    decision: "force-to-latest",
    state: {
      ...state,
      activeAssistantGeneration: generation,
      autoFollow: true,
    },
  };
}

export function updateAssistantMessage(
  state: ConversationViewportState,
  generation: number,
): ConversationViewportTransition {
  if (state.activeAssistantGeneration !== generation) {
    return startAssistantMessage(state, generation);
  }
  return {
    decision: state.autoFollow
      ? "follow-active-message"
      : "preserve-user-position",
    state,
  };
}

export function finishAssistantMessage(
  state: ConversationViewportState,
  generation: number,
): ConversationViewportTransition {
  if (state.activeAssistantGeneration !== generation) {
    return { decision: "no-op", state };
  }
  return {
    decision: "no-op",
    state: { ...state, activeAssistantGeneration: null },
  };
}

export function restoreConversation(
  state: ConversationViewportState,
): ConversationViewportTransition {
  return {
    decision: "force-to-latest",
    state: { ...state, activeAssistantGeneration: null, autoFollow: true },
  };
}

export type FrameScheduler = Readonly<{
  cancel: () => void;
  request: (callback: () => void) => void;
}>;

export function createFrameScheduler(
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void,
): FrameScheduler {
  let handle: number | null = null;
  let latestCallback: (() => void) | null = null;

  return {
    request(callback) {
      latestCallback = callback;
      if (handle !== null) return;
      handle = requestFrame(() => {
        handle = null;
        const next = latestCallback;
        latestCallback = null;
        next?.();
      });
    },
    cancel() {
      if (handle !== null) cancelFrame(handle);
      handle = null;
      latestCallback = null;
    },
  };
}
