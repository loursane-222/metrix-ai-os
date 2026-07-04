export type MemoryContextItemType =
  | "FACT"
  | "PROCESS"
  | "STRATEGIC"
  | "PREFERENCE";

export type MemoryContext = {
  version: "v1";
  generatedAt: string;
  organizationId: string;
  totalIncluded: number;
  facts: MemoryContextItem[];
  processes: MemoryContextItem[];
  strategic: MemoryContextItem[];
  preferences: MemoryContextItem[];
  highlights: MemoryContextItem[];
  conflicts: MemoryContextConflict[];
};

export type MemoryContextItem = {
  id: string;
  type: MemoryContextItemType;
  key: string;
  value: string;
  subjectType: string;
  subjectId: string | null;
  confidence: number;
  source: string;
  isUserConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MemoryContextConflict = {
  type: MemoryContextItemType;
  key: string;
  items: MemoryContextItem[];
  reason: "MULTIPLE_ACTIVE_VALUES";
};

export type BuildMemoryContextForOrganizationInput = {
  organizationId: string;
  maxItems?: number;
};
