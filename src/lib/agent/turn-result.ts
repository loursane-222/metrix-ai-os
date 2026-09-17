/**
 * The transport-independent outcome of one trusted METRIX Executive turn.
 * Business data is authoritative on its own; UI projections and speech are
 * consumers of this result, never its owner.
 */
export type CanonicalOperation = "read" | "mutation";

export type Verification = {
  status: "VERIFIED" | "UNVERIFIED";
  verified: boolean;
  replayed?: boolean;
};

export type CanonicalCapabilityResult<T = unknown> = {
  capability: string;
  operation: CanonicalOperation;
  data: T;
  verification?: Verification;
};

export type ApprovalReference = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  title: string;
};

export type ArtifactReference = {
  id: string;
  kind: string;
  version: number;
  title: string;
};

export type TurnResult<TPresentation = unknown> = {
  executiveText: string;
  capabilityResults: CanonicalCapabilityResult[];
  presentations: TPresentation[];
  approvals: ApprovalReference[];
  artifacts: ArtifactReference[];
};

export function createCanonicalCapabilityResult<T>(
  result: CanonicalCapabilityResult<T>
): CanonicalCapabilityResult<T> {
  return result;
}

export function createTurnResult<TPresentation = unknown>(input: {
  executiveText: string;
  capabilityResults?: CanonicalCapabilityResult[];
  presentations?: TPresentation[];
  approvals?: ApprovalReference[];
  artifacts?: ArtifactReference[];
}): TurnResult<TPresentation> {
  return {
    executiveText: input.executiveText,
    capabilityResults: input.capabilityResults ?? [],
    presentations: input.presentations ?? [],
    approvals: input.approvals ?? [],
    artifacts: input.artifacts ?? []
  };
}
