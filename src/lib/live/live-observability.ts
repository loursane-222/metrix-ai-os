export type LiveLifecycleEvent = {
  bindingId: string;
  openAiSessionId?: string;
  delegationId?: string;
  responseId?: string;
  callId?: string;
  phase: string;
  status: string;
  timestamp?: string;
};

function optionalIdentifier(
  value: string | undefined
): string | undefined {
  const normalized =
    value?.trim();

  return normalized
    ? normalized
    : undefined;
}

export function recordLiveLifecycle(
  event: LiveLifecycleEvent
): void {
  const timestamp =
    event.timestamp ??
    new Date().toISOString();

  console.info(
    "METRIX_LIVE_LIFECYCLE",
    {
      bindingId:
        event.bindingId,
      openAiSessionId:
        optionalIdentifier(
          event.openAiSessionId
        ),
      delegationId:
        optionalIdentifier(
          event.delegationId
        ),
      responseId:
        optionalIdentifier(
          event.responseId
        ),
      callId:
        optionalIdentifier(
          event.callId
        ),
      phase:
        event.phase,
      status:
        event.status,
      timestamp
    }
  );
}
