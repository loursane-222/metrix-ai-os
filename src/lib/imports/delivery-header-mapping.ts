import { detectColumnMappingWithAiFallback, type ColumnMapping as GenericColumnMapping } from "./column-mapping";

export type DeliveryImportField =
  | "orderNumberRef"
  | "warehouse"
  | "dispatchPoint"
  | "deliveryAddress"
  | "carrier"
  | "notes";

export const DELIVERY_IMPORT_FIELDS: readonly DeliveryImportField[] = [
  "orderNumberRef",
  "warehouse",
  "dispatchPoint",
  "deliveryAddress",
  "carrier",
  "notes",
];

export const DELIVERY_FIELD_LABELS: Record<DeliveryImportField, string> = {
  orderNumberRef: "Sipariş No",
  warehouse: "Depo",
  dispatchPoint: "Çıkış Noktası",
  deliveryAddress: "Teslimat Adresi",
  carrier: "Nakliyeci",
  notes: "Not",
};

const HEADER_ALIASES: Record<DeliveryImportField, readonly string[]> = {
  orderNumberRef: ["siparisno", "siparisnumarasi", "siparis", "sipariskodu"],
  warehouse: ["depo", "depoadi"],
  dispatchPoint: ["cikisnoktasi", "sevkyeri", "cikis"],
  deliveryAddress: ["teslimatadresi", "teslimadresi", "adres"],
  carrier: ["nakliyeci", "kargo", "tasiyici", "nakliyefirmasi"],
  notes: ["not", "aciklama", "notlar"],
};

const REQUIRED_FIELDS: readonly DeliveryImportField[] = ["orderNumberRef"];

export type ColumnMapping = GenericColumnMapping<DeliveryImportField>;

export function detectColumnMapping(headers: readonly string[], rows: readonly Record<string, string>[]): Promise<ColumnMapping> {
  return detectColumnMappingWithAiFallback(headers, rows, DELIVERY_IMPORT_FIELDS, HEADER_ALIASES, DELIVERY_FIELD_LABELS, undefined, REQUIRED_FIELDS);
}
