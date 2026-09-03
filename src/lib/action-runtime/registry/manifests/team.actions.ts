import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "team";

/**
 * Team (OrganizationMember) domaini daha önce yalnızca legacy HTTP route +
 * authorizeLegacyMutation ile yönetiliyordu — canonical Action Registry'de
 * hiç karşılığı yoktu (kanıtlanmış tam bypass). Bu manifest o boşluğu
 * kapatır: PATCH /api/organization-members/[memberId] ile birebir aynı
 * yetenek (role değişimi ve/veya disable/enable), aynı requiredPermission
 * ("members.manage"), aynı iş kuralları (kendi üyeliğini disable edememe).
 */
export const teamActionDefinitions: ActionDefinition[] = [
  {
    actionName: "organization_member.update",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      memberId: { type: "string", required: true },
      role: { type: "enum", required: false, enumValues: ["OWNER", "EXECUTIVE", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] },
      disabled: { type: "boolean", required: false },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["members.manage"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    // Self-compensating: replaying with the captured previous role/disabled
    // state restores the member (see organization-member-update-handler.ts).
    compensationRef: "organization_member.update",
  },
];
