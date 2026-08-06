import { describe, expect, it, vi } from "vitest";
import { assertAcceptanceMutationAllowed, isAcceptanceMutationRequest } from "../acceptance-mutation-guard";

describe("acceptance mutation guard", () => {
  it("recognizes acceptance provenance only on domain mutations", () => {
    expect(isAcceptanceMutationRequest({ actionName: "customer.create", input: { source: "ACCEPTANCE_TEST" } })).toBe(true);
    expect(isAcceptanceMutationRequest({ actionName: "customer.create", input: { source: "USER" } })).toBe(false);
    expect(isAcceptanceMutationRequest({ actionName: "customer.read", input: { source: "ACCEPTANCE_TEST" } })).toBe(false);
  });

  it("blocks marked acceptance writes outside test or isolated mode", () => {
    const previous = process.env.ACCEPTANCE_MODE;
    delete process.env.ACCEPTANCE_MODE;
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertAcceptanceMutationAllowed({ actionName: "customer.create", input: { source: "ACCEPTANCE_TEST" } })).toThrow("ACCEPTANCE_MUTATION_BLOCKED");
    if (previous === undefined) delete process.env.ACCEPTANCE_MODE;
    else process.env.ACCEPTANCE_MODE = previous;
    vi.unstubAllEnvs();
  });
});
