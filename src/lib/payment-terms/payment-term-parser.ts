import { parseStructuredPaymentTerm } from "./payment-term";
import type { PaymentTermComponent, StructuredPaymentTerm } from "./payment-term.types";

export type PaymentTermLanguageResult = { status: "PARSED"; term: StructuredPaymentTerm } | { status: "CLARIFICATION_REQUIRED"; message: string } | { status: "UNSUPPORTED" };

export function parseTurkishPaymentTerm(text: string): PaymentTermLanguageResult {
  const normalized = normalize(text);
  if (!normalized) return { status: "UNSUPPORTED" };
  if (normalized === "pesin") return parsed([percentage(10_000, immediate())]);
  if (normalized === "nakit") return { status: "CLARIFICATION_REQUIRED", message: "Nakit ödeme yöntemidir; ödeme vadesini ayrıca belirtin." };
  const singleDays = normalized.match(/^(\d+) gun(?: vade| vadeli| sonra)?(?: nakit)?$/u);
  if (singleDays) return parsed([percentage(10_000, relative(Number(singleDays[1]))) ]);
  if (/^(uc|3) (esit )?taksit$/u.test(normalized)) return { status: "CLARIFICATION_REQUIRED", message: "Taksit vadelerini belirtin; örneğin 30-60-90 gün." };
  const installments = normalized.match(/^(?:uc|3) esit taksit (\d+)[-\s/] *(\d+)[-\s/] *(\d+) gun$/u);
  if (installments) return parsed([percentage(3333, relative(Number(installments[1]))), percentage(3333, relative(Number(installments[2]))), percentage(3334, relative(Number(installments[3]))) ]);
  const half = normalized.match(/^(?:%?50|yuzde elli|yarisi) pesin[, ]+(?:%?50 )?(?:kalani )?(\d+) gun$/u);
  if (half) return parsed([percentage(5000, immediate()), percentage(5000, relative(Number(half[1]))) ]);
  const three = normalized.match(/^%?30 pesin[, ]+%?40 (\d+) gun[, ]+%?30 (\d+) gun$/u);
  if (three) return parsed([percentage(3000, immediate()), percentage(4000, relative(Number(three[1]))), percentage(3000, relative(Number(three[2]))) ]);
  return { status: "UNSUPPORTED" };
}

function parsed(components: PaymentTermComponent[]): PaymentTermLanguageResult { return { status: "PARSED", term: parseStructuredPaymentTerm({ schemaVersion: 1, strategy: "SCHEDULE", components }) }; }
function percentage(percentageBasisPoints: number, maturity: Omit<PaymentTermComponent, "allocationType" | "percentageBasisPoints">): PaymentTermComponent { return { allocationType: "PERCENTAGE", percentageBasisPoints, ...maturity } as PaymentTermComponent; }
function immediate() { return { maturityBasis: "IMMEDIATE" as const }; }
function relative(days: number) { return { maturityBasis: "DAYS_AFTER_REFERENCE" as const, days, referenceDateType: "INVOICE_DATE" as const }; }
function normalize(value: string): string { return value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/\s+/gu, " ").replace(/[.]/gu, ""); }
