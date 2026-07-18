"use client";

import { useCallback, useMemo } from "react";

import {
  executeCustomerUpdateAction,
  type ExecuteCustomerUpdateActionInput,
} from "@/lib/customers/customers-client";
import { createCustomerUpdateActionProducer } from "@/lib/executive-presence/producers/customer-update-action-producer";
import { useExecutivePresence } from "./ExecutivePresenceContext";

export function useExecutivePresenceCustomerUpdateActionProducer(): typeof executeCustomerUpdateAction {
  const { publishPresenceEvent } = useExecutivePresence();
  const producer = useMemo(
    () => createCustomerUpdateActionProducer({ publish: publishPresenceEvent }),
    [publishPresenceEvent],
  );

  return useCallback(
    (input: ExecuteCustomerUpdateActionInput) =>
      producer.execute({
        correlationId: input.correlationId,
        operationId: input.idempotencyKey,
        invoke: (correlationId) => executeCustomerUpdateAction({ ...input, correlationId }),
        isFailure: (result) => !result.ok,
        failureMessage: (result) =>
          result.ok ? "Customer update failed" : result.error,
      }),
    [producer],
  );
}
