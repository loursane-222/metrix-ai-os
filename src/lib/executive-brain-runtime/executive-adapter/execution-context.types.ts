import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";
import type { CompanyModel, ExecutiveReasoning, RecommendedNextMove } from "@/lib/executive-operating-system";

/**
 * ExecutiveExecutionContext — Tek bir runExecutiveAdapter() çalışması boyunca
 * modüller arası geçici veri köprüsü.
 *
 * Contract garantileri:
 *   - Ephemeral: yalnızca tek bir adapter pipeline run'ı boyunca yaşar.
 *   - Not persisted: snapshot'a, ExecutiveAdapterResult'a veya dış state'e yazılmaz.
 *   - Not returned: ExecutiveAdapterResult içine eklenmez; dışarıya sızmaz.
 *   - Mutable by design: upstream adapter yazar, downstream adapter okur.
 *   - Dependency-ordered: registry bağımlılık sırası dolduruluş sırasını garantiler.
 *
 * Kullanım akışı:
 *   1. runExecutiveAdapter() her çağrıda taze bir context oluşturur.
 *   2. Her modül adapter'ı (input, ctx) ikilisini alır.
 *   3. Upstream adapter kendi çıktısını ctx'e yazar.
 *   4. Downstream adapter ctx'den upstream çıktısını okur.
 *   5. Çalışma biter; context garbage-collect edilir.
 */
export type ExecutiveExecutionContext = {
  /**
   * conversation-understanding → executive-context-builder
   *
   * Yazar:  runConversationUnderstandingAdapter
   * Okuyur: runExecutiveContextBuilderAdapter
   *
   * Yoksa: ECB adapter "blocked_by_missing_context" döner.
   */
  conversationUnderstanding?: ConversationUnderstanding;

  /**
   * executive-context-builder → executive-reasoning
   *
   * Yazar:  runExecutiveContextBuilderAdapter
   * Okuyur: runExecutiveReasoningAdapter
   *
   * Yoksa: Reasoning adapter "blocked_by_missing_context" döner.
   */
  executiveContext?: ExecutiveContextV2;

  /**
   * company-model → executive-reasoning (ve forecast)
   *
   * Yazar:  runCompanyModelAdapter
   * Okuyur: runExecutiveReasoningAdapter, runForecastAdapter (gelecek fazlarda)
   *
   * Yoksa: downstream adapter "blocked_by_missing_context" döner.
   * MemoryContext mevcut değilse EMPTY_COMPANY_MODEL kopyasıyla doldurulur (confidence: "none").
   */
  companyModel?: CompanyModel;

  /**
   * executive-reasoning → recommended-next-move (ve diğer downstream modüller)
   *
   * Yazar:  runExecutiveReasoningAdapter
   * Okuyur: runRecommendedNextMoveAdapter
   *
   * Yoksa: downstream adapter "blocked_by_missing_context" döner.
   */
  executiveReasoning?: ExecutiveReasoning;

  /**
   * recommended-next-move → downstream modüller (snapshot-composer vb.)
   *
   * Yazar:  runRecommendedNextMoveAdapter
   * Okuyur: gelecek fazlarda
   *
   * Yoksa: downstream adapter "blocked_by_missing_context" döner.
   */
  recommendedNextMove?: RecommendedNextMove;
};
