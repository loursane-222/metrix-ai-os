const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

/** Deterministic UTC date formatting shared by document sources (for meta
 * field values) and the renderer, so a date never renders differently
 * depending on where it was formatted. */
export function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTH_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
