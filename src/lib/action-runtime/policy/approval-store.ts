import type { ApprovalRequest } from "./policy.types";

/**
 * Approval kalıcılığı için framework bağımsız soyutlama. Bu fazda yalnızca
 * in-memory bir implementasyon sağlanır; production'da bu interface'i
 * karşılayan kalıcı bir store ile değiştirilebilir. Hiçbir global mutable
 * state paylaşılmaz — her createInMemoryApprovalStore() çağrısı kendi
 * izole Map'ini yaratır.
 */
export interface ApprovalStore {
  save(request: ApprovalRequest): void;
  find(approvalId: string): ApprovalRequest | undefined;
  update(request: ApprovalRequest): void;
  listByActorAndOrganization(actorId: string, organizationId: string): ApprovalRequest[];
}

export function createInMemoryApprovalStore(): ApprovalStore {
  const requests = new Map<string, ApprovalRequest>();

  return {
    save(request) {
      requests.set(request.approvalId, request);
    },
    find(approvalId) {
      return requests.get(approvalId);
    },
    update(request) {
      requests.set(request.approvalId, request);
    },
    listByActorAndOrganization(actorId, organizationId) {
      return [...requests.values()].filter(
        (request) => request.actorId === actorId && request.organizationId === organizationId,
      );
    },
  };
}
