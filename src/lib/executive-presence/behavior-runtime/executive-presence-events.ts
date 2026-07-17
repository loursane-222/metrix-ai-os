import type { ExecutivePresenceErrorCategory } from "./executive-presence.types";

type EventBase<TType extends string> = Readonly<{
  eventId: string;
  type: TType;
  source: string;
  timestamp: number;
}>;

type CorrelatedEventBase<TType extends string> = EventBase<TType> &
  Readonly<{
    correlationId: string;
    scopeId?: string;
  }>;

type OperationEventBase<TType extends string> = CorrelatedEventBase<TType> &
  Readonly<{
    operationId: string;
  }>;

export type ExecutivePresenceEvent =
  | (CorrelatedEventBase<"VOICE_LISTENING_STARTED"> & Readonly<{ reason?: string }>)
  | CorrelatedEventBase<"VOICE_LISTENING_ENDED">
  | (CorrelatedEventBase<"CONVERSATION_THINKING_STARTED"> & Readonly<{ reason?: string }>)
  | CorrelatedEventBase<"CONVERSATION_THINKING_ENDED">
  | (CorrelatedEventBase<"SURFACE_APPLY_STARTED"> &
      Readonly<{ operationId?: string; reason?: string }>)
  | (CorrelatedEventBase<"SURFACE_APPLY_SUCCEEDED"> &
      Readonly<{ operationId?: string; reason?: string }>)
  | (CorrelatedEventBase<"SURFACE_APPLY_FAILED"> &
      Readonly<{ operationId?: string; reason?: string; error: string }>)
  | (OperationEventBase<"APPROVAL_REQUESTED"> & Readonly<{ reason?: string }>)
  | (OperationEventBase<"APPROVAL_RESOLVED"> & Readonly<{ reason?: string }>)
  | (OperationEventBase<"APPROVAL_EXPIRED"> &
      Readonly<{ reason?: string; error?: string }>)
  | (OperationEventBase<"ACTION_EXECUTION_STARTED"> & Readonly<{ reason?: string }>)
  | (OperationEventBase<"ACTION_EXECUTION_SUCCEEDED"> & Readonly<{ reason?: string }>)
  | (OperationEventBase<"ACTION_EXECUTION_FAILED"> &
      Readonly<{ reason?: string; error: string }>)
  | (EventBase<"FEEDBACK_COMPLETED"> &
      Readonly<{
        correlationId?: string;
        operationId?: string;
        scopeId?: string;
        reason?: string;
      }>)
  | (EventBase<"FEEDBACK_ERROR"> &
      Readonly<{
        correlationId?: string;
        operationId?: string;
        scopeId?: string;
        reason?: string;
        error: string;
        errorCategory: ExecutivePresenceErrorCategory;
      }>)
  | (EventBase<"SOURCE_RELEASED"> & Readonly<{ scopeId?: string }>)
  | EventBase<"CLOCK_TICK">;
