import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";

export const WEEKLY_HUMAN_CORE = [
  { key: "important_development", label: "Bu haftanın önemli gelişmesi" },
  { key: "customer_risk", label: "Sistemde görünmeyen müşteri riski" },
  { key: "near_close_opportunity", label: "Kapanmaya yaklaşan fırsat" },
  { key: "support_need", label: "Yönetimden destek ihtiyacı" },
  { key: "next_week_focus", label: "Gelecek hafta odağı" },
] as const;

export async function getReportManagementOverview(organizationId: string) {
  const [templates, members] = await Promise.all([prisma.reportTemplate.findMany({
    where: { organizationId },
    include: {
      versions: { orderBy: { version: "desc" } },
      assignments: {
        where: { active: true },
        include: {
          submissions: {
            orderBy: { dueDate: "desc" },
            take: 8,
            include: { answers: true, metricSnapshots: true, templateVersion: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  }), prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE" }, include: { user: { select: { id: true, fullName: true, email: true } } }, orderBy: { joinedAt: "asc" } })]);
  const submissions = templates.flatMap((template) => template.assignments.flatMap((assignment) => assignment.submissions));
  return {
    templates,
    members: members.map((item) => ({ userId: item.userId, label: item.user.fullName ?? item.user.email ?? item.userId, role: item.role })),
    summary: {
      activeTemplates: templates.filter((item) => item.active).length,
      activeAssignments: templates.reduce((sum, item) => sum + item.assignments.length, 0),
      submitted: submissions.filter((item) => item.status === "SUBMITTED").length,
      overdue: submissions.filter((item) => item.status !== "SUBMITTED" && item.dueDate < new Date()).length,
      pendingReview: submissions.filter((item) => item.status === "SUBMITTED" && item.reviewerStatus === "PENDING").length,
    },
  };
}

export async function createWeeklyReportTemplate(input: {
  organizationId: string;
  name: string;
  fixedCore?: unknown;
  focusedSection?: unknown;
  dynamicQuestions?: unknown;
  rationale: string;
}) {
  return prisma.reportTemplate.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      versions: {
        create: {
          version: 1,
          fixedCoreJson: (input.fixedCore ?? WEEKLY_HUMAN_CORE) as Prisma.InputJsonValue,
          focusedSectionJson: input.focusedSection as Prisma.InputJsonValue | undefined,
          dynamicQuestionsJson: input.dynamicQuestions as Prisma.InputJsonValue | undefined,
          rationale: input.rationale,
        },
      },
    },
    include: { versions: true },
  });
}

export async function createReportTemplateVersion(input: {
  organizationId: string;
  templateId: string;
  fixedCore: unknown;
  focusedSection?: unknown;
  dynamicQuestions?: unknown;
  rationale: string;
}) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.reportTemplate.findFirst({ where: { id: input.templateId, organizationId: input.organizationId } });
    if (!template) throw new Error("REPORT_TEMPLATE_NOT_FOUND");
    const latest = await tx.reportTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } });
    return tx.reportTemplateVersion.create({
      data: {
        templateId: template.id,
        version: (latest?.version ?? 0) + 1,
        fixedCoreJson: input.fixedCore as Prisma.InputJsonValue,
        focusedSectionJson: input.focusedSection as Prisma.InputJsonValue | undefined,
        dynamicQuestionsJson: input.dynamicQuestions as Prisma.InputJsonValue | undefined,
        rationale: input.rationale,
      },
    });
  });
}

export async function createReportAssignment(input: {
  organizationId: string;
  templateId: string;
  assigneeUserId: string;
  managerUserId?: string;
  dueRule?: unknown;
  dueDate?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.organizationMember.findFirst({ where: { organizationId: input.organizationId, userId: input.assigneeUserId, status: "ACTIVE" } });
    if (!member) throw new Error("REPORT_ASSIGNEE_NOT_IN_ORGANIZATION");
    const version = await tx.reportTemplateVersion.findFirst({ where: { template: { id: input.templateId, organizationId: input.organizationId } }, orderBy: { version: "desc" } });
    if (!version) throw new Error("REPORT_TEMPLATE_NOT_FOUND");
    const assignment = await tx.reportAssignment.create({ data: { organizationId: input.organizationId, templateId: input.templateId, assigneeUserId: input.assigneeUserId, managerUserId: input.managerUserId, dueRuleJson: input.dueRule as Prisma.InputJsonValue | undefined } });
    if (input.dueDate) {
      const end = input.dueDate;
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 7);
      await tx.reportSubmission.create({ data: { organizationId: input.organizationId, assignmentId: assignment.id, templateVersionId: version.id, periodStart: start, periodEnd: end, dueDate: end, provenanceJson: { source: "MANAGER_ASSIGNMENT" } } });
    }
    return assignment;
  });
}
