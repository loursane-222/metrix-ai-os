// Deterministic, closed-set unit-of-measure resolution. No conversion
// arithmetic between units is ever performed here or anywhere else in the
// inventory kernel — this module only canonicalizes a free-text label
// (e.g. "kg", "Kg.", "kilogram") into the fixed UnitOfMeasure enum, or
// rejects it outright. A resource's canonical unit is set once and then
// enforced exactly (see purchase-record.ts) — never silently reinterpreted.

import type { UnitOfMeasure } from "../../generated/prisma/enums";

export class UnknownUnitOfMeasureError extends Error {
  readonly code = "UNKNOWN_UNIT_OF_MEASURE";

  constructor(label: string) {
    super(`"${label}" is not a recognized canonical unit of measure`);
    this.name = "UnknownUnitOfMeasureError";
  }
}

/**
 * A resource's canonical unit is materialized once (on its first
 * inventory-affecting action) and enforced exactly afterward — never
 * silently reinterpreted or converted.
 */
export class UnitOfMeasureMismatchError extends Error {
  readonly code = "UNIT_OF_MEASURE_MISMATCH";

  constructor() {
    super(
      "The stated unit does not match this resource's already-established canonical unit"
    );
    this.name = "UnitOfMeasureMismatchError";
  }
}

const UNIT_ALIASES: Record<string, UnitOfMeasure> = {
  adet: "PIECE",
  ad: "PIECE",
  piece: "PIECE",
  pcs: "PIECE",
  kg: "KG",
  kilogram: "KG",
  g: "G",
  gr: "G",
  gram: "G",
  litre: "LITER",
  lt: "LITER",
  l: "LITER",
  liter: "LITER",
  ml: "ML",
  mililitre: "ML",
  milliliter: "ML",
  m: "M",
  metre: "M",
  meter: "M",
  "m2": "M2",
  "m²": "M2",
  metrekare: "M2",
  "m3": "M3",
  "m³": "M3",
  metreküp: "M3",
  metrekup: "M3",
  mtül: "LINEAR_M",
  mtul: "LINEAR_M",
  metretül: "LINEAR_M",
  metretul: "LINEAR_M",
  saat: "HOUR",
  hour: "HOUR",
  gece: "NIGHT",
  night: "NIGHT"
};

const CANONICAL_LABELS: Record<UnitOfMeasure, string> = {
  PIECE: "adet",
  KG: "kg",
  G: "g",
  LITER: "litre",
  ML: "ml",
  M: "m",
  M2: "m²",
  M3: "m³",
  LINEAR_M: "mtül",
  HOUR: "saat",
  NIGHT: "gece"
};

/** Deterministic lookup only — throws rather than guessing. */
export function resolveUnitOfMeasure(label: string): UnitOfMeasure {
  const normalized = label.trim().toLowerCase();
  const resolved = UNIT_ALIASES[normalized];

  if (!resolved) {
    throw new UnknownUnitOfMeasureError(label);
  }

  return resolved;
}

export function describeUnitOfMeasure(unit: UnitOfMeasure): string {
  return CANONICAL_LABELS[unit];
}
