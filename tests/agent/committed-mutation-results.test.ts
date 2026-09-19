import { describe, expect, it } from "vitest";

import {
  MetrixExecutiveTurnIncompleteError,
  committedMutationResults
} from "../../src/lib/agent/turn-incomplete-error";

import type { CanonicalCapabilityResult } from "../../src/lib/agent/turn-result";

const verifiedMutation: CanonicalCapabilityResult = {
  capability: "task_create",
  operation: "mutation",
  data: {},
  verification: { status: "VERIFIED", verified: true }
};

describe("committedMutationResults — only verified mutations count as committed", () => {
  it("keeps a VERIFIED mutation, including a replayed one", () => {
    const replayed: CanonicalCapabilityResult = {
      ...verifiedMutation,
      verification: { status: "VERIFIED", verified: true, replayed: true }
    };

    expect(committedMutationResults([verifiedMutation, replayed])).toEqual([verifiedMutation, replayed]);
  });

  it("drops a read, even one that carries a VERIFIED verification", () => {
    const verifiedRead: CanonicalCapabilityResult = {
      capability: "mail_search",
      operation: "read",
      data: {},
      verification: { status: "VERIFIED", verified: true }
    };

    expect(committedMutationResults([verifiedRead])).toEqual([]);
  });

  it("drops a mutation that is UNVERIFIED or has no verification", () => {
    const unverified: CanonicalCapabilityResult = {
      ...verifiedMutation,
      verification: { status: "UNVERIFIED", verified: true }
    };
    const none: CanonicalCapabilityResult = { ...verifiedMutation, verification: undefined };

    expect(committedMutationResults([unverified, none])).toEqual([]);
  });

  it("keeps only the committed ones from a mixed turn, in call order", () => {
    const read: CanonicalCapabilityResult = { capability: "task_list", operation: "read", data: {} };
    const second: CanonicalCapabilityResult = { ...verifiedMutation, capability: "calendar_create" };

    expect(committedMutationResults([read, verifiedMutation, second])).toEqual([verifiedMutation, second]);
  });
});

describe("MetrixExecutiveTurnIncompleteError", () => {
  it("preserves the original cause and states plainly that the mutation is committed", () => {
    const cause = new Error("original failure");
    const error = new MetrixExecutiveTurnIncompleteError({ cause, capabilityResults: [verifiedMutation] });

    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBe(cause);
    expect(error.code).toBe("TURN_INCOMPLETE");
    expect(error.committed).toBe(true);
    expect(error.capabilityResults).toEqual([verifiedMutation]);
    expect(error.name).toBe("MetrixExecutiveTurnIncompleteError");
  });
});
