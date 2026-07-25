export type CustomerLifecycleScope =
  | "CustomerConversation"
  | "CustomerPlanner"
  | "CustomerConversationExtension"
  | "ExecutiveNavigation";

export type CustomerLifecyclePayload = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function resolveCustomerCorrelationId(candidate?: string | null): string {
  const normalized = candidate?.trim();
  return normalized && SAFE_CORRELATION_ID.test(normalized)
    ? normalized
    : crypto.randomUUID();
}

export function emitCustomerLifecycle(
  scope: CustomerLifecycleScope,
  payload: CustomerLifecyclePayload,
): void {
  console.info(`[${scope}][lifecycle]`, JSON.stringify(payload));
}
