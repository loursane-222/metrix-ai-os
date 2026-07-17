import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCustomerEditCommand } from "@/lib/customers/customer-edit-command-resolver";
import { generateCustomerEditCommandText } from "@/lib/customers/customer-edit-command-ai-adapter";

/**
 * Customer Edit Command Resolution için tek, dar server sınırı: yalnızca bir
 * kullanıcı cümlesini strict-JSON bir Customer Edit komutuna sınıflandırır.
 * Hiçbir veri değiştirmez, hiçbir domain action çalıştırmaz — mounted
 * CustomerEditSurfaceRuntime'a uygulama tamamen client'ta (browser-local
 * command channel üzerinden) gerçekleşir. Yalnızca kimlik doğrulaması gerekir;
 * customerId burada yalnızca route/prompt bağlamı için taşınır, gerçek
 * mutasyon customer.update'in kendi authorize edilmiş sınırından geçer.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    await context.params;

    const body = await readJsonObject(request);
    const utterance = requiredString(body, "utterance");
    const activeTab = requiredString(body, "activeTab");

    const outcome = await resolveCustomerEditCommand({
      utterance,
      activeTab,
      generateText: generateCustomerEditCommandText,
    });

    return ok({ outcome });
  } catch (error: unknown) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
