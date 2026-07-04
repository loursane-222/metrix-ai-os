import type { OrganizationRole } from "@prisma/client";
import type { ExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import type { ExecutiveOperatingContext } from "@/lib/executive-operating-context";

export type ExecutiveDelegationOwnerType =
  | "USER"
  | "TEAM_MEMBER"
  | "CUSTOMER"
  | "SUPPLIER"
  | "SYSTEM"
  | "UNASSIGNED";

export type ExecutiveDelegationOwnerSource =
  | "DECISION_CATEGORY"
  | "ACCOUNTABILITY"
  | "PERSON_CONTEXT"
  | "PAYMENT_CONTEXT"
  | "QUOTE_CONTEXT"
  | "COLLECTION_CONTEXT"
  | "RULE"
  | "UNKNOWN";

export type ExecutiveDelegationConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveDelegationResult = {
  ownerType: ExecutiveDelegationOwnerType;
  ownerSource: ExecutiveDelegationOwnerSource;
  ownerName?: string | null;
  responsibilityReason: string;
  delegationAdvice: string;
  requiredActionByOwner: string;
  userShouldDoNow: string;
  riskIfNotAssigned: string;
  shouldCreateTask: false;
  confidence: ExecutiveDelegationConfidence;
};

export type ExecutiveDelegationPromptSummary = {
  ownerType: ExecutiveDelegationOwnerType;
  ownerName?: string | null;
  responsibilityReason: string;
  delegationAdvice: string;
  requiredActionByOwner: string;
  userShouldDoNow: string;
  riskIfNotAssigned: string;
  shouldCreateTask: false;
  confidence: ExecutiveDelegationConfidence;
};

export type ExecutiveDelegationEngineInput = {
  operatingContext: ExecutiveOperatingContext;
  executiveDecisionResult: ExecutiveDecisionResult | null;
  currentUserName?: string | null;
  organizationMembershipRole?: OrganizationRole | string | null;
};
