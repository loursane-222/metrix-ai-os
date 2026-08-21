import { listProductionOrders } from "@/lib/production/productions-client";
import { resolveProductionOrderReference } from "@/lib/production/production-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { productionHandoff } from "./conversation-extension-handoff";

const LIST = /^(?:(?:üretim\s+emirlerini|uretim\s+emirlerini)\s+(?:göster|goster|listele)|üretim\s+emri\s+listesi|uretim\s+emri\s+listesi)[.!]?$/iu;
const CREATE = /^(?:yeni\s+(?:bir\s+)?)?üretim\s+emri\s+(?:oluştur|olustur|ekle)[.!]?$/iu;
const OPEN = /^(.+?)\s+üretim\s+emrini\s+aç[.!]?$/iu;

function navigate(route: string, source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") void dispatchConversationNavigation({ route, source, correlationId, expectedSurfaceAuthorityKey: route.endsWith("/new") ? "production.create.page" : "production.list.page" });
}
async function resolve(reference: string) {
  const response = await listProductionOrders();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveProductionOrderReference(response.data.productions, reference) } as const;
}

export const productionManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `production-management:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (LIST.test(text)) {
      navigate("/metrix/production", source, correlationId);
      return { status: "HANDOFF", handoff: productionHandoff({ operation: "NAVIGATE", outcomeCode: "PRODUCTION_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }
    if (CREATE.test(text)) {
      navigate("/metrix/production/new", source, correlationId);
      return { status: "HANDOFF", handoff: productionHandoff({ operation: "NAVIGATE", outcomeCode: "PRODUCTION_CREATE_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }
    const match = text.match(OPEN);
    if (!match) return { status: "NOT_HANDLED", handoff: null };
    const found = await resolve(match[1]!.trim());
    if ("error" in found) return { status: "HANDOFF", handoff: productionHandoff({ operation: "NAVIGATE", outcomeCode: "PRODUCTION_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "PRODUCTION_LOOKUP_FAILED" }) };
    if (found.resolution.status !== "RESOLVED") {
      return { status: "HANDOFF", handoff: productionHandoff({ operation: "NAVIGATE", outcomeCode: found.resolution.status === "AMBIGUOUS" ? "PRODUCTION_AMBIGUOUS" : "PRODUCTION_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: found.resolution.status }) };
    }
    navigate(`/metrix/production/${encodeURIComponent(found.resolution.productionOrder.id)}`, source, correlationId);
    return { status: "HANDOFF", handoff: productionHandoff({ operation: "NAVIGATE", outcomeCode: "PRODUCTION_ORDER_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [found.resolution.productionOrder.orderNumber] }) };
  },
};
