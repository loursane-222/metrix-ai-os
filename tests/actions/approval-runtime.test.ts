import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const requestImplementationPath = join(process.cwd(), "src/lib/actions/approval-request.ts");
const resolveImplementationPath = join(process.cwd(), "src/lib/actions/approval-resolve.ts");
const listImplementationPath = join(process.cwd(), "src/lib/actions/approval-list.ts");

const implementationExists =
  existsSync(requestImplementationPath) &&
  existsSync(resolveImplementationPath) &&
  existsSync(listImplementationPath);

describe("generic approval runtime (request / resolve / list)", () => {
  it("requires the typed approval-request/resolve/list implementations", () => {
    expect(implementationExists).toBe(true);
  });

  it("gates a real canonical action behind a durable, tenant-scoped, ADMIN-resolved, replay-safe approval", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { executeApprovalRequest } = await import("../../src/lib/actions/approval-request");
    const { executeApprovalResolve } = await import("../../src/lib/actions/approval-resolve");
    const { listApprovalsForOrganization } = await import("../../src/lib/actions/approval-list");
    const { executeQuoteCreate } = await import("../../src/lib/actions/quote-create");

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `appr-org-${suffix}`;
    const otherOrgId = `appr-other-org-${suffix}`;
    const requesterId = `appr-requester-${suffix}`;
    const adminId = `appr-admin-${suffix}`;
    const memberId = `appr-member-${suffix}`;
    const otherOrgUserId = `appr-other-org-user-${suffix}`;
    const customerId = `appr-customer-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Approval Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        { id: requesterId, email: `${requesterId}@example.test`, name: "Requester" },
        { id: adminId, email: `${adminId}@example.test`, name: "Admin Approver" },
        { id: memberId, email: `${memberId}@example.test`, name: "Plain Member" },
        { id: otherOrgUserId, email: `${otherOrgUserId}@example.test`, name: "Other Org User" }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        { organizationId, userId: requesterId, role: "MEMBER" },
        { organizationId, userId: adminId, role: "ADMIN" },
        { organizationId, userId: memberId, role: "MEMBER" },
        { organizationId: otherOrgId, userId: otherOrgUserId, role: "ADMIN" }
      ]
    });

    await db.customer.create({ data: { id: customerId, organizationId, name: "Onay Test Müşterisi" } });

    try {
      const quoteA = await executeQuoteCreate({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: `quote-a-${suffix}`,
        customerId,
        title: "Onaylanacak teklif"
      });

      const quoteB = await executeQuoteCreate({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: `quote-b-${suffix}`,
        customerId,
        title: "Reddedilecek teklif"
      });

      // --- request: unknown actionType is rejected, no side effect ---
      await expect(executeApprovalRequest({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: `unknown-${suffix}`,
        actionType: "quote.delete_forever",
        payload: { quoteId: quoteA.quote.id }
      })).rejects.toMatchObject({ code: "UNKNOWN_APPROVABLE_ACTION" });

      // --- request: authorized create + verified readback ---
      const requestKey = `request-a-${suffix}`;

      const requested = await executeApprovalRequest({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: requestKey,
        actionType: "quote.mark_won",
        payload: { quoteId: quoteA.quote.id }
      });

      expect(requested.action).toBe("approval.request");
      expect(requested.verified).toBe(true);
      expect(requested.replayed).toBe(false);
      expect(requested.approval.status).toBe("PENDING");
      expect(requested.approval.requestedById).toBe(requesterId);

      const approvalId = requested.approval.id;

      // --- request: exact replay ---
      const requestReplay = await executeApprovalRequest({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: requestKey,
        actionType: "quote.mark_won",
        payload: { quoteId: quoteA.quote.id }
      });

      expect(requestReplay.replayed).toBe(true);
      expect(requestReplay.approval.id).toBe(approvalId);

      const onePendingApproval = await db.approvalRequest.count({ where: { organizationId, status: "PENDING" } });
      expect(onePendingApproval).toBe(1);

      // --- resolve: a plain MEMBER cannot approve ---
      await expect(executeApprovalResolve({
        actorUserId: memberId,
        organizationId,
        idempotencyKey: `member-attempt-${suffix}`,
        approvalId,
        decision: "APPROVE"
      })).rejects.toMatchObject({ code: "APPROVAL_APPROVER_NOT_PERMITTED" });

      const stillPending = await db.approvalRequest.findUnique({ where: { id: approvalId } });
      expect(stillPending?.status).toBe("PENDING");

      // --- resolve: cross-tenant approver cannot see/resolve this org's approval ---
      await expect(executeApprovalResolve({
        actorUserId: otherOrgUserId,
        organizationId: otherOrgId,
        idempotencyKey: `cross-tenant-${suffix}`,
        approvalId,
        decision: "APPROVE"
      })).rejects.toMatchObject({ code: "APPROVAL_NOT_FOUND" });

      // --- resolve: ADMIN approves, underlying action executes exactly once ---
      const resolveKey = `resolve-a-${suffix}`;

      const resolved = await executeApprovalResolve({
        actorUserId: adminId,
        organizationId,
        idempotencyKey: resolveKey,
        approvalId,
        decision: "APPROVE"
      });

      expect(resolved.action).toBe("approval.resolve");
      expect(resolved.verified).toBe(true);
      expect(resolved.replayed).toBe(false);
      expect(resolved.approval.status).toBe("EXECUTED");

      const quoteAfter = await db.quote.findUniqueOrThrow({ where: { id: quoteA.quote.id } });
      expect(quoteAfter.status).toBe("WON");

      const underlyingExecution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "quote.mark_won",
            idempotencyKey: `approval:${approvalId}`
          }
        }
      });
      expect(underlyingExecution?.status).toBe("VERIFIED");

      // --- resolve: exact replay does not re-execute ---
      const resolveReplay = await executeApprovalResolve({
        actorUserId: adminId,
        organizationId,
        idempotencyKey: resolveKey,
        approvalId,
        decision: "APPROVE"
      });

      expect(resolveReplay.replayed).toBe(true);
      expect(resolveReplay.approval.status).toBe("EXECUTED");

      // --- resolve: a NEW idempotencyKey on an already-resolved approval is rejected, never double-executes ---
      await expect(executeApprovalResolve({
        actorUserId: adminId,
        organizationId,
        idempotencyKey: `double-resolve-${suffix}`,
        approvalId,
        decision: "APPROVE"
      })).rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });

      const quoteMarkWonExecutions = await db.actionExecution.count({
        where: { organizationId, actionType: "quote.mark_won", resourceId: quoteA.quote.id }
      });
      expect(quoteMarkWonExecutions).toBe(1);

      // --- reject flow: a second approval is rejected, underlying action never runs ---
      const secondRequest = await executeApprovalRequest({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: `request-b-${suffix}`,
        actionType: "quote.mark_won",
        payload: { quoteId: quoteB.quote.id }
      });

      const rejected = await executeApprovalResolve({
        actorUserId: adminId,
        organizationId,
        idempotencyKey: `reject-b-${suffix}`,
        approvalId: secondRequest.approval.id,
        decision: "REJECT"
      });

      expect(rejected.approval.status).toBe("REJECTED");

      const quoteBAfter = await db.quote.findUniqueOrThrow({ where: { id: quoteB.quote.id } });
      expect(quoteBAfter.status).toBe("DRAFT");

      await expect(executeApprovalResolve({
        actorUserId: adminId,
        organizationId,
        idempotencyKey: `reject-b-again-${suffix}`,
        approvalId: secondRequest.approval.id,
        decision: "APPROVE"
      })).rejects.toMatchObject({ code: "APPROVAL_ALREADY_RESOLVED" });

      // --- expiry: a PENDING approval past its deadline cannot be resolved ---
      const thirdRequest = await executeApprovalRequest({
        actorUserId: requesterId,
        organizationId,
        idempotencyKey: `request-c-${suffix}`,
        actionType: "quote.mark_won",
        payload: { quoteId: quoteB.quote.id },
        expiresInMinutes: 5
      });

      await db.approvalRequest.update({
        where: { id: thirdRequest.approval.id },
        data: { expiresAt: new Date(Date.now() - 60_000) }
      });

      await expect(executeApprovalResolve({
        actorUserId: adminId,
        organizationId,
        idempotencyKey: `expire-c-${suffix}`,
        approvalId: thirdRequest.approval.id,
        decision: "APPROVE"
      })).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });

      const expired = await db.approvalRequest.findUnique({ where: { id: thirdRequest.approval.id } });
      expect(expired?.status).toBe("EXPIRED");

      // --- list: tenant isolation + status filter ---
      const orgApprovals = await listApprovalsForOrganization({ actorUserId: adminId, organizationId });
      expect(orgApprovals.map(a => a.id)).toEqual(
        expect.arrayContaining([approvalId, secondRequest.approval.id, thirdRequest.approval.id])
      );

      const executedOnly = await listApprovalsForOrganization({ actorUserId: adminId, organizationId, status: "EXECUTED" });
      expect(executedOnly.map(a => a.id)).toEqual([approvalId]);

      const otherOrgApprovals = await listApprovalsForOrganization({ actorUserId: otherOrgUserId, organizationId: otherOrgId });
      expect(otherOrgApprovals).toEqual([]);
    } finally {
      await db.actionExecution.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.approvalRequest.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.quoteItem.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.quote.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.user.deleteMany({ where: { id: { in: [requesterId, adminId, memberId, otherOrgUserId] } } });
      await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrgId] } } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
