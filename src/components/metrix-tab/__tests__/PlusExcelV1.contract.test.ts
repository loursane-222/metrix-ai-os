import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const chat = readFileSync(resolve(root, "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");
const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
const importFiles = ["customers", "products", "invoices", "suppliers", "payments", "offers", "orders", "stock", "production"] as const;
const componentNames = ["Customer", "Product", "Invoice", "Supplier", "Payment", "Offer", "Order", "Stock", "Production"] as const;

describe("approved Plus + Excel Import V1 contract", () => {
  it("preserves the exact attachment actions and native file authorities", () => {
    for (const label of ["Dosya Yükle", "Fotoğraf Çek", "Fotoğraf Seç", "Excel/CSV İçe Aktar", "Vazgeç"]) expect(chat).toContain(label);
    expect(chat).toContain('accept: "image/jpeg,image/png,image/webp,application/pdf"');
    expect(chat).toContain('accept: "image/*", capture: "environment"');
    expect(chat).toContain('accept: "image/*"');
    expect(chat).toContain("setIsAttachOpen(false); setIsImportPickerOpen(true);");
  });

  it("adds only component-local dialog, focus containment, Escape and focus return", () => {
    expect(chat).toContain('role="dialog"');
    expect(chat).toContain('aria-labelledby="attachment-sheet-title"');
    expect(chat).toContain('aria-labelledby="import-domain-sheet-title"');
    expect(chat).toContain('event.key === "Escape"');
    expect(chat).toContain('event.key !== "Tab"');
    expect(chat).toContain("attachmentTriggerRef.current?.focus()");
    expect(chat).toContain('className="metrix-sheet-backdrop absolute inset-0"');
  });

  it("keeps the exact nine-domain picker and existing dispatch wiring", () => {
    const options = chat.slice(chat.indexOf("const IMPORT_DOMAIN_OPTIONS"), chat.indexOf("];", chat.indexOf("const IMPORT_DOMAIN_OPTIONS")) + 2);
    for (const label of ["Müşteri", "Ürün", "Fatura", "Tedarikçi", "Tahsilat", "Teklif", "Sipariş", "Stok", "Üretim"]) expect(options).toContain(`label: "${label}"`);
    expect(options).not.toContain("Teslimat");
    expect(chat).toContain("dispatchConversationNavigation({ route, source: \"written\"");
    expect(chat).toContain("setIsImportPickerOpen(false)");
  });

  it("keeps file, parse/commit, preview, duplicate, progress and result contracts across visible domains", () => {
    importFiles.forEach((domain, index) => {
      const source = readFileSync(resolve(root, `src/components/${domain}/${componentNames[index]}ImportWizard.tsx`), "utf8");
      expect(source).toContain('accept=".xlsx,.csv"');
      expect(source).not.toContain("multiple");
      expect(source).toContain("maksimum 10 MB");
      expect(source).toContain(`/api/${domain}/imports/parse`);
      expect(source).toContain(`/api/${domain}/imports/commit`);
      expect(source).toContain('role="alert"');
      expect(source).toContain('"upload" | "preview" | "done"');
      expect(source).toContain("unmappedHeaders");
      expect(source).toContain("failed");
      expect(source).toContain("İçe aktarılıyor…");
      expect(source).toContain("progress.done");
      expect(source).toContain("progress.total");
      expect(source).toContain("data-import-wizard-v1");
    });
  });

  it("keeps customer duplicate and row-action semantics visible", () => {
    const customer = readFileSync(resolve(root, "src/components/customers/CustomerImportWizard.tsx"), "utf8");
    for (const value of ['value="create"', 'value="update"', 'value="skip"', "duplicateCount", "Güncelle", "Atla"]) expect(customer).toContain(value);
  });

  it("uses the approved navy family without legacy warm sheet or turquoise import CTA", () => {
    const sheets = chat.slice(chat.indexOf("function AttachmentSheet"), chat.indexOf("// ─── History Sheet"));
    expect(sheets).not.toContain('bg-[#faf8f3]');
    expect(sheets).not.toContain('text-[#6a5040]');
    expect(css).toContain(".metrix-action-sheet");
    expect(css).toContain("[data-import-wizard-v1]");
    expect(css).toContain("rgba(12,21,40,.97)");
  });
});
