import { listCustomers, getCustomer, requestCustomerArchiveAction, confirmCustomerArchiveAction, cancelCustomerArchiveAction, type CustomerRecord } from "@/lib/customers/customers-client";
import { buildCustomerRoute, type CustomerNavigationDescriptor } from "@/lib/customers/customer-navigation";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { customerCreateConversationCoordinator } from "@/lib/customers/customer-create-conversation-coordinator";
import type { ConversationExtension } from "./conversation-extension-contract";

let pendingArchive: { customerId: string; displayName: string; approvalId: string } | null = null;
const normalized = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
const confirmWords = /^(evet|onayliyorum|onaylıyorum|onayla|tamam)$/i;
const cancelWords = /^(hayir|hayır|vazgec|vazgeç|iptal)$/i;

function currentCustomerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname.match(/^\/metrix\/customers\/([^/]+)(?:\/edit)?$/)?.[1] ?? null;
}
function navigate(descriptor: CustomerNavigationDescriptor) {
  if (typeof window !== "undefined") window.location.assign(buildCustomerRoute(descriptor));
}
function summary(customer: CustomerRecord): string {
  const parts = [`${customer.displayName}: durum ${customer.status}`];
  if (customer.legalName) parts.push(`ticari unvan ${customer.legalName}`);
  if (customer.primaryContact?.fullName) parts.push(`yetkili ${customer.primaryContact.fullName}`);
  if (customer.phone) parts.push(`telefon ${customer.phone}`);
  if (customer.email) parts.push(`e-posta ${customer.email}`);
  if (customer.cariKodu) parts.push(`cari kodu ${customer.cariKodu}`);
  if (customer.taxNumber) parts.push(`vergi no ${customer.taxNumber}`);
  if (customer.tier) parts.push(`grup ${customer.tier}`);
  if (customer.healthScore !== null) parts.push(`iliski skoru ${customer.healthScore}`);
  parts.push(`bakiye ${customer.balanceCents} ${customer.currency} kurus`);
  parts.push(`e-fatura ${customer.eInvoiceEnabled ? "aktif" : "pasif"}, e-arsiv ${customer.eArchiveEnabled ? "aktif" : "pasif"}`);
  if (customer.billingAddress || customer.shippingAddress) parts.push("adres bilgisi mevcut");
  if (customer.metrixNote) parts.push(`not: ${customer.metrixNote}`);
  parts.push(`son guncelleme ${customer.updatedAt}`);
  return `${parts.join("; ")}.`;
}
async function resolve(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

export const customerManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    if (typeof window === "undefined") return null;
    return `customers-management:${window.location.pathname}`;
  },
  async execute(utterance) {
    const text = normalized(utterance);
    try {
      const createResult = await customerCreateConversationCoordinator.execute(utterance);
      if (createResult.handled) {
        return { status: createResult.status === "FAILED" ? "HANDLED_FAILED" : createResult.status === "CLARIFICATION" ? "HANDLED_CLARIFICATION" : "HANDLED_EXECUTED", message: createResult.message };
      }
      if (pendingArchive && confirmWords.test(text)) {
        const pending = pendingArchive;
        const response = await confirmCustomerArchiveAction(pending.customerId, pending.approvalId);
        if (!response.ok) return { status: "HANDLED_FAILED", message: response.error };
        pendingArchive = null;
        navigate({ kind: "customer.detail", customerId: pending.customerId });
        return { status: "HANDLED_EXECUTED", message: `${pending.displayName} pasife alindi.` };
      }
      if (pendingArchive && cancelWords.test(text)) {
        const pending = pendingArchive; pendingArchive = null;
        await cancelCustomerArchiveAction(pending.customerId, pending.approvalId);
        return { status: "HANDLED_EXECUTED", message: `${pending.displayName} icin pasife alma iptal edildi.` };
      }
      if (/musteri(ler)?( listesini)? (ac|goster)|musterilere git/.test(text)) { navigate({ kind: "customers.list" }); return { status: "HANDLED_EXECUTED", message: "Musteri listesi aciliyor." }; }
      const archiveMatch = utterance.match(/^(.+?)\s+müşterisini\s+pasife al$/i) ?? utterance.match(/^(.+?)\s+musterisini\s+pasife al$/i);
      if (archiveMatch) {
        const found = await resolve(archiveMatch[1]!); if ("error" in found) return { status: "HANDLED_FAILED", message: found.error ?? "Musteriler okunamadi." };
        if (found.resolution.status === "NOT_FOUND") return { status: "HANDLED_CLARIFICATION", message: "Bu tanimla bir musteri bulamadim." };
        if (found.resolution.status === "AMBIGUOUS") return { status: "HANDLED_CLARIFICATION", message: `Birden fazla eslesme var: ${found.resolution.options.map((x) => x.displayName).join(", ")}. Hangisi?` };
        const customer = found.resolution.customer; const approval = await requestCustomerArchiveAction(customer.id);
        if (!approval.ok) return { status: "HANDLED_FAILED", message: approval.error };
        pendingArchive = { customerId: customer.id, displayName: customer.displayName, approvalId: approval.data.approval.approvalId };
        return { status: "HANDLED_CLARIFICATION", message: `${customer.displayName} pasife alinacak. Onayliyor musun?` };
      }
      const intent = utterance.match(/^(.+?)\s+müşterisini\s+(aç|duzenle|düzenle|özetle|ozetle)$/i) ?? utterance.match(/^(.+?)\s+musterisini\s+(ac|duzenle|ozetle)$/i);
      if (intent) {
        const found = await resolve(intent[1]!); if ("error" in found) return { status: "HANDLED_FAILED", message: found.error ?? "Musteriler okunamadi." };
        if (found.resolution.status === "NOT_FOUND") return { status: "HANDLED_CLARIFICATION", message: "Bu tanimla bir musteri bulamadim." };
        if (found.resolution.status === "AMBIGUOUS") return { status: "HANDLED_CLARIFICATION", message: `Birden fazla eslesme var: ${found.resolution.options.map((x) => x.displayName).join(", ")}. Hangisi?` };
        const customer = found.resolution.customer;
        if (/özetle|ozetle/i.test(intent[2]!)) { const detail = await getCustomer(customer.id); return detail.ok ? { status: "HANDLED_EXECUTED", message: summary(detail.data.customer) } : { status: "HANDLED_FAILED", message: detail.error }; }
        navigate({ kind: /duzenle|düzenle/i.test(intent[2]!) ? "customer.edit" : "customer.detail", customerId: customer.id });
        return { status: "HANDLED_EXECUTED", message: `${customer.displayName} aciliyor.` };
      }
      const currentId = currentCustomerId();
      if (currentId && /bu musteriyi (duzenle|düzenle)/.test(text)) { navigate({ kind: "customer.edit", customerId: currentId }); return { status: "HANDLED_EXECUTED", message: "Duzenleme ekrani aciliyor." }; }
      return { status: "NOT_HANDLED", message: null };
    } catch { return { status: "HANDLED_FAILED", message: "Musteri islemi guvenli bicimde tamamlanamadi." }; }
  },
};
export function resetCustomerManagementConversationForTests() { pendingArchive = null; customerCreateConversationCoordinator.store.reset(); }
