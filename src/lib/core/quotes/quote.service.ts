import {
  findByIdForOrganization,
  listByOrganization,
} from "./quote.repository";

import type { ListQuotesByOrganizationInput, QuoteResult } from "./quote.types";

export async function listQuotesByOrganization(
  input: ListQuotesByOrganizationInput,
): Promise<QuoteResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");

  return listByOrganization(input);
}

export async function findQuoteByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<QuoteResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return findByIdForOrganization(id, organizationId);
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
