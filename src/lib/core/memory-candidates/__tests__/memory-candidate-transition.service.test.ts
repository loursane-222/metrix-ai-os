import { describe, expect, it, vi } from "vitest";
import { assertMemoryCandidateTransitionAuthorization } from "../memory-candidate-transition-authorization";

const repositoryMocks = vi.hoisted(() => ({
  createCandidate: vi.fn(),
  findByIdForOrganization: vi.fn(),
  listPendingByOrganization: vi.fn(),
  markApproved: vi.fn(),
  markRejected: vi.fn(),
  markDismissed: vi.fn(),
  markExpired: vi.fn(),
}));
vi.mock("../memory-candidate.repository", () => repositoryMocks);

import {
  approveMemoryCandidate,
  dismissMemoryCandidate,
  expireMemoryCandidate,
  rejectMemoryCandidate,
} from "../memory-candidate.service";

describe("MemoryCandidate domain transition services", () => {
  it.each([
    ["APPROVE", approveMemoryCandidate, repositoryMocks.markApproved, { reviewedByUserId: "user-1" }],
    ["REJECT", rejectMemoryCandidate, repositoryMocks.markRejected, { reviewedByUserId: "user-1" }],
    ["DISMISS", dismissMemoryCandidate, repositoryMocks.markDismissed, { reviewedByUserId: "user-1" }],
    ["EXPIRE", expireMemoryCandidate, repositoryMocks.markExpired, {}],
  ] as const)("issues a valid %s capability", async (transition, service, repository, extra) => {
    repository.mockResolvedValueOnce(null);
    await service({ id: "candidate-1", organizationId: "org-1", ...extra } as never);
    const authorization = repository.mock.calls[0][0];
    expect(() => assertMemoryCandidateTransitionAuthorization(authorization, transition)).not.toThrow();
    expect(authorization).toMatchObject({ targetId: "candidate-1", organizationId: "org-1" });
  });
});
