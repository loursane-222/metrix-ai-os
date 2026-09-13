import type {
  ExecutiveToolContext
} from "./tools/task-create-tool";

export type MetrixExecutiveContext =
  ExecutiveToolContext;

export type MetrixExecutiveTurnInput = {
  actorUserId: string;
  organizationId: string;
  turnId: string;
  message: string;
};

export type MetrixExecutiveTurnResult = {
  finalOutput: string;
  executionItems: unknown[];
};
