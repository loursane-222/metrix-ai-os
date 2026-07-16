import type { ActionDefinition } from "../registry/action-registry.types";
import type { PolicyRiskLevel, RuntimeRiskContext } from "./policy.types";

const RISK_ORDER: readonly PolicyRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function riskRank(level: PolicyRiskLevel): number {
  return RISK_ORDER.indexOf(level);
}

function maxRisk(a: PolicyRiskLevel, b: PolicyRiskLevel): PolicyRiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

/**
 * Risk yalnızca statik metadata değildir: action'ın base risk seviyesi
 * (Registry'den) çalışma zamanı bağlamıyla birleştirilir. Her adım
 * maxRisk ile uygulanır — bu yüzden hiçbir girdi base risk seviyesini
 * düşüremez, yalnızca yükseltebilir. Customers'a özgü alan/tutar kuralı
 * içermez; yalnızca generic yükselticiler uygulanır.
 */
export function computeRuntimeRisk(
  actionDefinition: ActionDefinition,
  runtimeRiskContext?: RuntimeRiskContext,
): PolicyRiskLevel {
  let level: PolicyRiskLevel = actionDefinition.riskLevelBase;

  if (!runtimeRiskContext) {
    return level;
  }

  if (runtimeRiskContext.externalSideEffect) {
    level = maxRisk(level, "HIGH");
  }

  if (runtimeRiskContext.reversibilityClass === "IRREVERSIBLE") {
    level = maxRisk(level, "HIGH");
  }

  const minimumRiskLevel = runtimeRiskContext.organizationPolicyOverrides?.minimumRiskLevel;
  if (minimumRiskLevel) {
    level = maxRisk(level, minimumRiskLevel);
  }

  return level;
}
