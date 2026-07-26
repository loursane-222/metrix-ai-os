import type { ExecutiveOutcomeV1 } from "./executive-outcome.contracts";

export type ExecutiveOutcomeMemoryProjectionV1 = Readonly<{
  key: "karar_sonucu";
  value: string;
  confidence: number;
}>;

export function projectExecutiveOutcomeToMemory(
  outcome: ExecutiveOutcomeV1,
): ExecutiveOutcomeMemoryProjectionV1 | null {
  if (outcome.sourceOutcome === "UNAVAILABLE" || outcome.status === "PENDING") {
    return null;
  }
  const label =
    outcome.status === "ACHIEVED"
      ? "başarılı"
      : outcome.status === "NOT_ACHIEVED"
        ? "başarısız"
        : outcome.status === "ABANDONED"
          ? "vazgeçildi"
          : "sonucu belirsiz";
  return Object.freeze({
    key: "karar_sonucu",
    value: `${outcome.objective.title}: ${label}`,
    confidence: outcome.confidence === "HIGH" ? 0.9 : 0.7,
  });
}
