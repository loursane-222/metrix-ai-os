import {
  createManualMemory,
  getOrganizationMemoryContext,
} from "@/lib/core/memories/memory.service";

import type {
  CreateMemoryInput,
  CreateMemoryResult,
  GetMemoryContextResult,
} from "./memory.types";

export async function createMemory(
  input: CreateMemoryInput,
): Promise<CreateMemoryResult> {
  return createManualMemory(input);
}

export async function getMemoryContext(
  organizationId: string,
): Promise<GetMemoryContextResult> {
  return getOrganizationMemoryContext(organizationId);
}

