// Mirrors src/lib/conversation-extensions/business-navigation-telemetry.ts's
// structured console.info convention. Sensitive payload values (customer
// balances, pipeline amounts, any connector-specific business content) are
// deliberately never passed here — only identifiers, statuses, and counts.
type SafeValue = string | number | boolean | null | undefined;

export type CompanyIntelligenceTelemetryScope = "CompanyIntelligence";

export function emitCompanyIntelligenceTelemetry(scope: CompanyIntelligenceTelemetryScope, payload: Readonly<Record<string, SafeValue>>): void {
  console.info(`[${scope}][lifecycle]`, JSON.stringify(payload));
}
