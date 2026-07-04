import {
  archiveSalesGoal,
  createSalesGoal,
  getSalesGoalById,
  listSalesGoalsForOrganization,
  updateSalesGoal,
} from "./goal.repository";

import type { CreateSalesGoalInput, ListSalesGoalsInput, SalesGoalResult, UpdateSalesGoalInput } from "./goal.types";

export async function createNewSalesGoal(input: CreateSalesGoalInput): Promise<SalesGoalResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.title, "title");

  return createSalesGoal(input);
}

export async function getSalesGoalByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<SalesGoalResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return getSalesGoalById(id, organizationId);
}

export async function listSalesGoals(input: ListSalesGoalsInput): Promise<SalesGoalResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");

  return listSalesGoalsForOrganization(input);
}

export async function updateSalesGoalDetails(input: UpdateSalesGoalInput): Promise<void> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");

  return updateSalesGoal(input);
}

export async function archiveSalesGoalById(id: string, organizationId: string): Promise<void> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return archiveSalesGoal(id, organizationId);
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
