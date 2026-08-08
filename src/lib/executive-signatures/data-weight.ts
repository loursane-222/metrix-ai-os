export type DataWeightState = "inactive" | "approaching" | "threshold" | "exceeded";

/** Signature 09: verinin.agirligi — only a caller-supplied real threshold activates it. */
export function resolveDataWeight(value: number, threshold: number | null): DataWeightState {
  if (!threshold || threshold <= 0 || !Number.isFinite(value)) return "inactive";
  const ratio = value / threshold;
  if (ratio > 1) return "exceeded";
  if (ratio >= 0.99) return "threshold";
  return ratio >= 0.9 ? "approaching" : "inactive";
}
