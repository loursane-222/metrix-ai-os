import type { ExecutivePresenceEvent } from "../behavior-runtime";

type PublishPresenceEvent = (event: ExecutivePresenceEvent) => void;

type CustomerUpdateActionProducerDependencies = Readonly<{
  publish: PublishPresenceEvent;
  createId?: () => string;
  now?: () => number;
}>;

type CustomerUpdateActionInvocation<TResult> = Readonly<{
  correlationId?: string;
  operationId: string;
  invoke: (correlationId: string) => Promise<TResult>;
  isFailure: (result: TResult) => boolean;
  failureMessage: (result: TResult) => string;
}>;

const SOURCE = "customer-update-action";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createCustomerUpdateActionProducer({
  publish,
  createId = () => crypto.randomUUID(),
  now = Date.now,
}: CustomerUpdateActionProducerDependencies) {
  return Object.freeze({
    async execute<TResult>({
      correlationId: suppliedCorrelationId,
      operationId,
      invoke,
      isFailure,
      failureMessage,
    }: CustomerUpdateActionInvocation<TResult>): Promise<TResult> {
      const correlationId = suppliedCorrelationId ?? createId();
      let terminalPublished = false;

      publish({
        type: "ACTION_EXECUTION_STARTED",
        eventId: createId(),
        source: SOURCE,
        timestamp: now(),
        correlationId,
        operationId,
      });

      const publishTerminal = (event: ExecutivePresenceEvent): void => {
        if (terminalPublished) return;
        terminalPublished = true;
        publish(event);
      };

      try {
        const result = await invoke(correlationId);
        if (isFailure(result)) {
          publishTerminal({
            type: "ACTION_EXECUTION_FAILED",
            eventId: createId(),
            source: SOURCE,
            timestamp: now(),
            correlationId,
            operationId,
            error: failureMessage(result),
          });
        } else {
          publishTerminal({
            type: "ACTION_EXECUTION_SUCCEEDED",
            eventId: createId(),
            source: SOURCE,
            timestamp: now(),
            correlationId,
            operationId,
          });
        }
        return result;
      } catch (error) {
        if (!isAbortError(error)) {
          publishTerminal({
            type: "ACTION_EXECUTION_FAILED",
            eventId: createId(),
            source: SOURCE,
            timestamp: now(),
            correlationId,
            operationId,
            error: error instanceof Error ? error.message : "Customer update failed",
          });
        }
        throw error;
      }
    },
  });
}
