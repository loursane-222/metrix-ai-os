import type {
  OrganizationRole
} from "../../generated/prisma/enums";

import { db } from "../db";

export class OrganizationAccessDeniedError
  extends Error {
  readonly code = "ORGANIZATION_ACCESS_DENIED";

  constructor() {
    super("Organization access denied");
    this.name = "OrganizationAccessDeniedError";
  }
}

export type OrganizationAccess = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
};

function requireIdentifier(
  value: string,
  field: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new OrganizationAccessDeniedError();
  }

  if (field.length === 0) {
    throw new OrganizationAccessDeniedError();
  }

  return normalized;
}

export async function requireOrganizationAccess(
  input: {
    userId: string;
    organizationId: string;
  }
): Promise<OrganizationAccess> {
  const userId =
    requireIdentifier(input.userId, "userId");

  const organizationId =
    requireIdentifier(
      input.organizationId,
      "organizationId"
    );

  const membership =
    await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId
        }
      },
      select: {
        organizationId: true,
        userId: true,
        role: true
      }
    });

  if (!membership) {
    throw new OrganizationAccessDeniedError();
  }

  return membership;
}
