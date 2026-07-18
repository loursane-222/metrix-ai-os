export type ResolutionValidationIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class ExecutiveRequestResolutionValidationError extends Error {
  readonly issues: readonly ResolutionValidationIssue[];

  constructor(issues: readonly ResolutionValidationIssue[]) {
    super(`Executive request resolution violated ${issues.length} invariant(s).`);
    this.name = "ExecutiveRequestResolutionValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class CapabilityProviderContractError extends Error {
  readonly providerId: string;

  constructor(providerId: string, message: string) {
    super(message);
    this.name = "CapabilityProviderContractError";
    this.providerId = providerId;
  }
}
