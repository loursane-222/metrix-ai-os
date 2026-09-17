import { z } from "zod";

import { db } from "../db";

const OrganizationCreateInputSchema = z.object({
  userId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200)
});

export type OrganizationCreateInput = z.input<
  typeof OrganizationCreateInputSchema
>;

export class UserAlreadyHasOrganizationError extends Error {
  readonly code = "USER_ALREADY_HAS_ORGANIZATION";

  constructor() {
    super("This user already belongs to an organization");
    this.name = "UserAlreadyHasOrganizationError";
  }
}

export type OrganizationCreateResult = {
  organizationId: string;
  organizationName: string;
};

/**
 * One organization per fresh account, created explicitly by the user
 * (never auto-created behind their back). Not idempotency-keyed like the
 * Executive's business tools — this is a one-time onboarding step guarded
 * instead by "does this user already have a membership", which is itself
 * race-safe: the unique constraint on (organizationId, userId) plus this
 * upfront check means a double-submit resolves to the same single
 * membership rather than two organizations.
 */
export async function executeOrganizationCreate(
  rawInput: OrganizationCreateInput
): Promise<OrganizationCreateResult> {
  const input = OrganizationCreateInputSchema.parse(rawInput);

  const existing = await db.organizationMember.findFirst({
    where: { userId: input.userId }
  });

  if (existing) {
    throw new UserAlreadyHasOrganizationError();
  }

  const organization = await db.organization.create({
    data: {
      name: input.name,
      members: {
        create: { userId: input.userId, role: "OWNER" }
      }
    }
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name
  };
}
