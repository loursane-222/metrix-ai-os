import type { ApprovalTtlClass } from "../registry/action-registry.types";

/**
 * approvalTtlClass -> gerçek süre (ms) eşlemesi merkezi olarak burada
 * yaşar. ActionDefinition yalnızca sınıfı taşır; gerçek süre değeri
 * hiçbir action tanımına gömülmez, yalnızca bu konfigürasyondan okunur.
 */
export type PolicyConfig = {
  approvalTtlMsByClass: Readonly<Record<ApprovalTtlClass, number>>;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const DEFAULT_POLICY_CONFIG: PolicyConfig = Object.freeze({
  approvalTtlMsByClass: Object.freeze({
    SHORT: 5 * MINUTE_MS,
    STANDARD: 30 * MINUTE_MS,
    EXTENDED: 24 * HOUR_MS,
  }),
});
