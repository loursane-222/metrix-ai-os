import { fail } from "@/lib/api/response";
import { ApiValidationError } from "@/lib/api/validation";
import { AuthError } from "@/lib/auth/shared/auth.errors";

import {
  ApprovalRequiredError,
  ExecutionFailedError,
  ExecutionRejectedError,
  HandlerNotFoundError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  RegistryLookupFailedError,
} from "../execution";
import {
  CustomerNotFoundError,
  CustomerUpdateInputError,
  CustomerVersionConflictError,
} from "../domains/customers";

const GENERIC_EXECUTION_FAILURE_MESSAGE = "Action execution failed.";

/**
 * Domain Action Execution Runtime'ın attığı hataları ve customer.update'in
 * bilinen domain hatalarını, ham internal detay/tenant bilgisi/stack trace
 * sızdırmadan kontrollü HTTP yanıtlarına çevirir. Bilinmeyen her hata
 * (ExecutionFailedError.cause dahil) güvenli, generic bir 500 mesajına düşer.
 */
export function mapExecutionErrorToHttpResponse(error: unknown): Response {
  if (error instanceof ApiValidationError) {
    return fail(error.message, error.status);
  }

  if (error instanceof AuthError) {
    return fail(error.message, error.status);
  }

  if (error instanceof InputValidationError) {
    return fail(error.message, 400);
  }

  if (error instanceof PolicyDeniedError) {
    return fail("Bu islemi gerceklestirme yetkiniz yok.", 403);
  }

  if (error instanceof ApprovalRequiredError) {
    return fail("Bu islem onay gerektiriyor.", 409);
  }

  if (error instanceof IdempotencyConflictError) {
    return error.reasonCode === "IN_PROGRESS"
      ? fail("Bu islem zaten devam ediyor; yeni bir islem baslatilmadi.", 409)
      : fail("Bu istek anahtari farkli bir icerikle daha once kullanildi.", 409);
  }

  if (error instanceof ExecutionRejectedError) {
    return fail("Bu islem su haliyle calistirilamaz.", 400);
  }

  if (error instanceof RegistryLookupFailedError || error instanceof HandlerNotFoundError) {
    return fail(GENERIC_EXECUTION_FAILURE_MESSAGE, 500);
  }

  if (error instanceof ExecutionFailedError) {
    return mapKnownDomainCause(error.cause) ?? fail(GENERIC_EXECUTION_FAILURE_MESSAGE, 500);
  }

  return fail(GENERIC_EXECUTION_FAILURE_MESSAGE, 500);
}

function mapKnownDomainCause(cause: unknown): Response | null {
  if (cause instanceof CustomerUpdateInputError) {
    return fail(cause.message, 400);
  }

  if (cause instanceof CustomerNotFoundError) {
    return fail("Customer not found.", 404);
  }

  if (cause instanceof CustomerVersionConflictError) {
    return fail(
      "Musteri siz duzenlerken degisti. Guncel kaydi yeniden yukleyip degisiklikleri kontrol edin.",
      409,
    );
  }

  return null;
}
