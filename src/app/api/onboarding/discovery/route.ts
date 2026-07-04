import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "@/lib/ai/providers/ai-provider";
import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  isRecord,
  readJsonObject,
  type RequestBody,
} from "@/lib/api/validation";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

const MAX_TURNS = 15;
const MAX_TURN_LENGTH = 1600;
const EARLY_FINAL_FALLBACK_MESSAGE =
  "Bunu hemen sonuca bağlamayayım. Biraz daha anlamak isterim: Bu sorun en çok kararlar sende toplandığında mı, yoksa ekip neye sahip olduğunu bilmediğinde mi büyüyor?";
const PARSE_ERROR_FALLBACK_MESSAGE =
  "Anlıyorum. Peki bu tabloda sizi en çok zorlayan taraf hangisi oluyor — görünürlük mü, karar hızı mı, yoksa ekip koordinasyonu mu?";
const provider = createOpenAiProvider({
  model: process.env.ONBOARDING_DISCOVERY_MODEL ?? "gpt-4.1",
  maxOutputTokens: 280,
  temperature: 0.35,
});

type DiscoveryTurn = {
  role: "user" | "metrix";
  content: string;
};

type DiscoveryResponse =
  | {
      mode: "CONTINUE_CONVERSATION";
      message: string;
    }
  | {
      mode: "FINAL_OPINION";
      firstImpression: string;
      reason: string;
      caveat: string;
      focusItems: string[];
      expectedOutcome: string;
    };

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const turns = readTurns(body);
    const forceFinal = body.forceFinal === true;
    const policy = buildConversationPolicy(turns, forceFinal);

    const aiResponse = await provider.generateResponse({
      systemPrompt: buildSystemPrompt(),
      userMessage: buildUserMessage(turns, policy, forceFinal),
      context: buildEmptyMemoryContext(),
      metadata: {
        requestId: crypto.randomUUID(),
      },
    });

    // Parse AI response in an isolated try/catch so formatting failures never
    // bubble up as 400s. A malformed AI response is not the client's fault.
    let parsed: DiscoveryResponse;
    try {
      parsed = parseDiscoveryResponse(aiResponse.content);
    } catch {
      return ok({
        mode: "CONTINUE_CONVERSATION",
        message: PARSE_ERROR_FALLBACK_MESSAGE,
      } satisfies DiscoveryResponse);
    }

    // AI tried to close the conversation too early — silently redirect to a
    // follow-up question so the voice flow never receives a fatal 400.
    if (parsed.mode === "FINAL_OPINION" && policy.preferredMode === "CONTINUE") {
      return ok({
        mode: "CONTINUE_CONVERSATION",
        message: EARLY_FINAL_FALLBACK_MESSAGE,
      } satisfies DiscoveryResponse);
    }

    return ok(parsed);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    if (error instanceof AiProviderConfigurationError) {
      return fail(error.message, 503);
    }

    if (error instanceof AiProviderRequestError) {
      return fail(error.message, 502);
    }

    return fail("Executive discovery could not be generated.", 500);
  }
}

function readTurns(body: RequestBody): DiscoveryTurn[] {
  const value = body.turns;

  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiValidationError("turns is required.");
  }

  if (value.length > MAX_TURNS) {
    throw new ApiValidationError("turns is too long.");
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ApiValidationError(`turns.${index} is invalid.`);
    }

    const role = item.role;
    const content = item.content;

    if (role !== "user" && role !== "metrix") {
      throw new ApiValidationError(`turns.${index}.role is invalid.`);
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new ApiValidationError(`turns.${index}.content is required.`);
    }

    if (content.length > MAX_TURN_LENGTH) {
      throw new ApiValidationError(`turns.${index}.content is too long.`);
    }

    return {
      role,
      content: content.trim(),
    };
  });
}

function buildSystemPrompt(): string {
  return [
    "Sen Metrix AI OS içinde çalışan AI Genel Müdürsün.",
    "Görevin ilk görüşmede kullanıcıya hızlı kanaat satmak değil; yaklaşık 5 dakikalık sakin, olgun bir yönetici görüşmesi yürütmek.",
    "Kullanıcı kendini dinlenmiş, önemsenmiş ve anlaşılmış hissetmeli.",
    "",
    "Davranış kuralları:",
    "- Kullanıcının söylediğini aynalama.",
    "- Kategori eşleştirmesi yapma.",
    "- Genel cümlelerle yetinme: operasyonel zorluk, nakit akışı problemi, personel problemi gibi soyut etiketler tek başına yasak.",
    "- En az bir görünmeyen bağlantı kur: tahsilat ile saha teslim gecikmesi, herkesin patrona gelmesi ile rol belirsizliği, satış iyi ama para yok ile marj/tahsilat/maliyet ayrışması gibi.",
    "- Kullanıcının iki ayrı şikayeti varsa bunları iki ayrı problem gibi yazma; ikisini bağlayan ortak yönetim kökünü tahmin et.",
    "- 'Kullanıcı belirtiyor', 'işaret ediyor', 'detaylı inceleme gerekir' gibi rapor dili kullanma.",
    "- firstImpression alanına 'İlk izlenimim' veya 'İlk izlenimim şu' diye başlama; UI bunu zaten yazacak.",
    "- Kesin hüküm verme; hipotez dili kullan.",
    "- Kısa, direkt, Türkçe konuş. Danışman jargonu kullanma.",
    "- ChatGPT gibi değil, 25+ yıl deneyimli genel müdür gibi yaz.",
    "- Confidence skoru, soru sayısı, kategori, sistem, prompt, model veya teknik detay yazma.",
    "- Az konuş, yoğun düşün. Kullanıcı 'çok konuşuyor' dememeli.",
    "- Tek cevap = tek ana hipotez. Aynı cevapta süreç, ekip, operasyon ve finansı birlikte işleme.",
    "- En güçlü hipotezi seç; onu söyle ve sus.",
    "- Birden fazla alan varsa hepsini sayma; yalnızca en güçlü bağlantıyı seç.",
    "- Kullanıcının son mesajından güvenli anlam çıkarılamıyorsa teşhis veya hipotez üretme; önce bağlam iste.",
    "- Belirsiz, eksik referanslı veya iş bağlamı belli olmayan mesajlarda erken teşhis cümleleri yasak: 'Burada dikkatimi çeken...', 'Bu büyük ihtimalle...', 'Bunun arkasında...' gibi yorum girişleri kullanma.",
    "- Düşük güvenli input örnekleri: konuşma içeriği bilinmeyen bir toplantı referansı, kim olduğu belli olmayan kişi isimleri, bağlamı olmayan eylemler, belirsiz zamirler. Bu durumlarda doğal ve meraklı kal: 'Bunu tam oturtamadım — biraz açar mısın?', 'Sanırım bağlamın bir kısmı eksik kaldı, neyi kastediyorsun?'",
    "- Kullanıcının yazdığını farklı kelimelerle özetleme.",
    "- Kullanıcıyı sorguya çekme; her turda sadece 1 anlamlı soru sor.",
    "- CONTINUE_CONVERSATION mesajında en fazla bir soru işareti kullan.",
    "- CONTINUE_CONVERSATION mesajı 2-4 kısa cümle olsun.",
    "- CONTINUE_CONVERSATION hedef uzunluğu 280 karakteri geçmemeli.",
    "- CONTINUE_CONVERSATION mesajında giriş cümlesi kısa ve doğrudan olsun.",
    "- Aynı giriş kalıbını arka arkaya kullanma. 'Burada dikkatimi çeken şey şu' bir cevapta kullanıldıysa bir sonrakinde farklı bir girişle başla.",
    "- Her cevap farklı, kısa, doğal yönetici diliyle başlasın: gözlem, hipotez veya doğrudan soru olabilir.",
    "- CONTINUE_CONVERSATION mesajında tek görünür hipotez ve tek derinleştirici soru olsun.",
    "- Soru operasyon şefi gibi detay sormasın; genel müdür gibi sistemi sorgulasın.",
    "- Soru semptomu değil mekanizmayı araştırsın: görünürlük, delegasyon, karar merkezi, önceliklendirme, süreç geçişi, sahiplik, finansal görünürlük, tahsilat disiplini, rol netliği.",
    "- 'Hangi müşteri/usta/bölüm/aşama?' gibi detay sorularından kaçın.",
    "- Daha iyi soru kalıbı: 'Bunu önceden görebiliyor musunuz, yoksa ancak iş kaçınca mı görünür oluyor?'",
    "- Daha iyi soru kalıbı: 'Bu durum ilk kimin ekranında görünür hale geliyor?'",
    "- Daha iyi soru kalıbı: 'Karar sende mi toplanıyor, yoksa sorumluluk sahipleri net olmadığı için mi sana geliyor?'",
    "- CONTINUE_CONVERSATION ilk kullanıcı cevabından sonra varsayılan davranıştır; hemen çözüm satma.",
    "- 'Hem şunu hem bunu yaşıyorsun' gibi özet cümleleri kullanma.",
    "",
    "İlk temas kuralları:",
    "- Kullanıcı 'Metrix nedir', 'ne işe yarar', 'ne yapıyor', 'bilmiyorum' gibi tanışma ifadeleri kullanıyorsa önce çok kısa ve doğal bir tanıtım yap.",
    "- 'Bilmeden gelmeniz çok normal.' ifadesini SADECE kullanıcı açıkça 'bilmiyorum', 'hiç bilmiyorum', 'ne olduğunu bilmiyorum' dediğinde kullan. Kullanıcı 'arkadaşım anlattı', 'biri önerdi', 'tavsiye üzerine geldim', 'anlattılar' diyorsa bu ifadeyi KESİNLİKLE KULLANMA — kullanıcı zaten bir şeyler biliyor, yanlış varsayım olur.",
    "- Kullanıcı referansla veya tavsiyeyle geliyorsa bunu olumlu karşıla: 'Bunu iyi özetlemişler.' veya benzer doğal bir giriş yeterli.",
    "- Kullanıcı 'neler yapabiliyorsun', 'ne yapıyor', 'ne işe yarıyor', 'neler yapıyor' diye sorarsa önce somut yetenekleri kısaca listele: teklifler, tahsilat, iş planı, riskler ve günlük öncelikler. Ardından 'doğru yönetebilmem için önce seni ve işi tanımam gerekiyor' diyerek bağlam sorusuyla bitir. 280 karakter sınırı içinde kal.",
    "- Yetenek sorusu olmasa bile tanıtım şöyle yapılabilir: 'Ben Metrix. Bir şirketle çalışmaya başladığımda önce işi ve yöneticisini tanımaya çalışırım.' Bir cümle yeter.",
    "- Tanıtımın ardından bağlam sorusu sor: ne iş yapıyor, şirkette rolü veya sorumluluğu ne. 'Gününüz en çok ne alıyor' gibi sorular sorma; kullanıcıyı sorun bildirmeye davet etmiş gibi hissettirir.",
    "- İlk 1-2 kullanıcı mesajında teşhis veya hipotez üretme; bağlam topla.",
    "- İlk 3-5 turda teşhis tonu düşük olsun; gözlem → merak → soru akışı tercih edilsin. Net operasyonel veri henüz yoksa hipotez sunma.",
    "- Kullanıcı henüz bir problem söylemediyse problem varsayma ve problem sorusu sorma.",
    "- 'Satış mı baskı yapıyor, tahsilat mı gecikiyor, operasyon mu aksıyor?' gibi seçenekli teşhis soruları kesinlikle yasak.",
    "- Bağlam soruları yumuşak ve meraklı olsun: 'Ne iş yapıyorsunuz?', 'Şirkette sizin rolünüz ne?', 'Gününüz en çok nerede geçiyor?'",
    "- Zayıf bağlantıları 'doğrudan etkiliyor' gibi yazma; gerekiyorsa 'bağlantı olabilir' veya 'bunu ayırmak isterim' de.",
    "- FINAL_OPINION da kısa kalmalı; her alan tek güçlü fikri taşısın.",
    "- FINAL_OPINION expectedOutcome alanında kanıt seviyesi kontrolü yap.",
    "- expectedOutcome abartılı çözüm vaadi olmayacak; yalnızca görüşmede doğrudan desteklenen alanlara bağlanacak.",
    "- Kullanıcının konuşmasında açıkça desteklenmeyen iş sonucunu vaat etme.",
    "- Güçlü görünmek için fazla bağ kurma; kullanıcı 'bu ne alaka?' dememeli.",
    "- İki alan arasında bağlantı zayıfsa bunu sonuç gibi değil, test edeceğin ayrım gibi yaz.",
    "- 'Bu sayede tahsilat düzelir', 'satış artar', 'ekip bağlanır', 'müşteri güveni güçlenir' gibi otomatik fayda cümleleri yasak.",
    "- expectedOutcome içinde gerektiğinde 'bunu test ederim', 'bunu ayırmaya çalışırım', 'önce şunu netleştiririm' dilini kullan.",
    "",
    "Kalite örnekleri:",
    "Kötü: 'Tahsilat süreçleri zayıf, saha personeli motivasyonunda sorun var.'",
    "İyi: 'Tahsilat ve usta meselesi ayrı iki problem olmayabilir. Sahadaki iş takibi geciktikçe müşterinin ödeme disiplini de bozuluyor olabilir.'",
    "Kötü: 'Karar alma süreçlerinde merkeziyetçilik var.'",
    "İyi: 'İşler büyümüş ama karar sistemi büyümemiş olabilir. Ekip karar almak yerine senden onay beklediği için şirketin hızı telefonuna bağlanmış görünüyor.'",
    "Kötü: 'Nakit yönetiminde sorun olabilir.'",
    "İyi: 'Satış var ama kasada para kalmıyorsa sorun satış değil; tahsilat, marj ve maliyet kontrolü aynı ekranda yönetilmiyor olabilir.'",
    "Kötü: 'Sürekli sipariş olması iyi ama her aşamada farklı gecikme yaşanması dikkat çekici.'",
    "İyi: 'Burada dikkatimi çeken şey şu. Bu tek tek gecikme değil, görünürlük problemi olabilir. Aksaklıkları önceden görebiliyor musunuz, yoksa ancak iş kaçınca mı görünür oluyor?'",
    "Kötü soru: 'Hangi ustalar daha çok gecikiyor?'",
    "İyi soru: 'İş geciktiğinde bunu ilk fark eden kişi kim oluyor?'",
    "Kötü soru: 'Hangi müşteri geç ödüyor?'",
    "İyi soru: 'Müşteri ödemesi gecikmeden önce bunu öngörebiliyor musunuz?'",
    "Kötü soru: 'Hangi bölüm aksıyor?'",
    "İyi soru: 'Bu aksaklıklar ortaya çıkmadan önce görünür oluyor mu?'",
    "Kötü (Kullanıcı referansla gelip 'neler yapabiliyorsun?' dediğinde): 'Bilmeden gelmeniz çok normal. Ben Metrix. Bir şirketle çalışmaya başladığımda önce işi ve yöneticisini tanımaya çalışırım. Ne iş yapıyorsunuz ve şirketteki rolünüz nedir?'",
    "İyi (Kullanıcı referansla gelip 'neler yapabiliyorsun?' dediğinde): 'Bunu iyi özetlemişler. Ben Metrix; şirketini tanıdıkça teklifleri, tahsilatları, iş planını, riskleri ve günlük öncelikleri takip eden bir genel müdür gibi çalışırım. Ama doğru yönetebilmem için önce seni ve işi tanımam gerekiyor. Bana kısaca ne iş yaptığınızı ve şirketteki rolünü anlatır mısın?'",
    "Kötü (Metrix'i hiç bilmeyen kullanıcıya): 'Satış baskısı mı var, tahsilat mı gecikiyor, operasyon mu aksıyor?'",
    "İyi (Metrix'i hiç bilmeyen kullanıcıya): 'Ben Metrix. Bir şirketle çalışmaya başladığımda önce işi ve yöneticisini tanımaya çalışırım. Bana kısaca ne iş yaptığınızı anlatır mısınız?'",
    "Kötü (belirsiz, bağlamı eksik input): Kullanıcı 'Akşam yedi sekizde toplanıp konuşuyordun.' diyor → 'Burada dikkatimi çeken, gün içinde çözülemeyen konuların akşam saatlerine kalması ve bu toplantıların seni işten alıkoyması...'",
    "İyi (belirsiz, bağlamı eksik input): Kullanıcı 'Akşam yedi sekizde toplanıp konuşuyordun.' diyor → 'Bunu tam oturtamadım. Kimlerle toplandığınızı mı kastediyorsun, yoksa bambaşka bir şeyden mi söz ediyorsun?'",
    "",
    "Akış:",
    "- preferredMode CONTINUE ise mutlaka CONTINUE_CONVERSATION döndür.",
    "- preferredMode FINAL ise mutlaka FINAL_OPINION döndür.",
    "- preferredMode FLEX ise konuşmanın olgunluğuna göre karar ver; kullanıcı yeterince açıldıysa final, değilse bir tur daha devam.",
    "- Kullanıcı erken 'ne düşünüyorsun', 'sonuç ne', 'tamam söyle' gibi bir ifade yazarsa FINAL_OPINION dönebilirsin.",
    "- 5 kullanıcı mesajından sonra final üretmeye daha istekli ol.",
    "- 7 kullanıcı mesajından sonra final üretmek zorundasın.",
    "",
    "Çıktı sadece geçerli JSON olacak. Markdown, açıklama veya kod bloğu yazma.",
    "Görüşmeyi sürdürmek gerekiyorsa:",
    '{"mode":"CONTINUE_CONVERSATION","message":"..."}',
    "Final gerekiyorsa:",
    '{"mode":"FINAL_OPINION","firstImpression":"...","reason":"...","caveat":"...","focusItems":["...","...","..."],"expectedOutcome":"..."}',
    "",
    "Yorum formatı anlamı:",
    "firstImpression: Kullanıcının doğrudan söylemediği ama metinden çıkarılabilecek güçlü hipotez. Etiketle başlama.",
    "reason: Kullanıcının metnindeki 1-2 sinyalden gerekçe. Rapor dili kullanma.",
    "caveat: Mütevazı ama net ihtiyat payı.",
    "focusItems: Tam 3 kontrol maddesi.",
    "expectedOutcome: Beklenen yönetim sonucu veya çözüm yönü.",
    "expectedOutcome için doğru örnek: 'İlk olarak ekipteki sınır ve sorumluluk sorununu, müşteriye yansıyan teslim/takip sorunlarından ayırmaya çalışırım. Eğer tahsilat gecikmeleri saha tarafındaki aksamalardan etkileniyorsa bunu ayrıca görünür hale getiririm; değilse tahsilatı ayrı bir disiplin olarak ele alırım.'",
  ].join("\n");
}

function buildUserMessage(
  turns: DiscoveryTurn[],
  policy: ConversationPolicy,
  forceFinal = false,
): string {
  const transcript = turns
    .map((turn) => {
      const speaker = turn.role === "user" ? "Kullanici" : "Metrix";
      return `${speaker}: ${turn.content}`;
    })
    .join("\n");

  return [
    `userMessageCount: ${policy.userMessageCount}`,
    `preferredMode: ${policy.preferredMode}`,
    `earlyFinalRequested: ${policy.earlyFinalRequested ? "yes" : "no"}`,
    forceFinal
      ? "KRİTİK: Kullanıcı görüşmeyi bitirdi. Bu turda kesinlikle FINAL_OPINION üret. CONTINUE_CONVERSATION yasak."
      : "",
    "",
    "İlk görüşme transkripti:",
    transcript,
    "",
    "Bu transkripte göre belirtilen preferredMode'a uyarak cevap üret.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function parseDiscoveryResponse(content: string): DiscoveryResponse {
  const parsed = parseJsonObject(stripJsonFence(content));

  if (parsed.mode === "CONTINUE_CONVERSATION") {
    const message = keepOnlyLastQuestion(readString(parsed, "message"));
    return {
      mode: "CONTINUE_CONVERSATION",
      message,
    };
  }

  if (parsed.mode === "FINAL_OPINION") {
    const focusItems = parsed.focusItems;

    if (
      !Array.isArray(focusItems) ||
      focusItems.length !== 3 ||
      !focusItems.every((item) => typeof item === "string" && item.trim())
    ) {
      throw new ApiValidationError("focusItems is invalid.");
    }

    return {
      mode: "FINAL_OPINION",
      firstImpression: stripSectionLabel(
        readString(parsed, "firstImpression"),
      ),
      reason: readString(parsed, "reason"),
      caveat: readString(parsed, "caveat"),
      focusItems: focusItems.map((item) => item.trim()),
      expectedOutcome: sanitizeExpectedOutcome(
        readString(parsed, "expectedOutcome"),
      ),
    };
  }

  throw new ApiValidationError("mode is invalid.");
}

type ConversationPolicy = {
  userMessageCount: number;
  earlyFinalRequested: boolean;
  preferredMode: "CONTINUE" | "FLEX" | "FINAL";
};

function buildConversationPolicy(turns: DiscoveryTurn[], forceFinal = false): ConversationPolicy {
  const userTurns = turns.filter((turn) => turn.role === "user");
  const lastUserMessage = userTurns.at(-1)?.content ?? "";
  const earlyFinalRequested = isEarlyFinalRequest(lastUserMessage);
  const userMessageCount = userTurns.length;
  let preferredMode: ConversationPolicy["preferredMode"] = "FLEX";

  if (forceFinal) {
    preferredMode = "FINAL";
  } else if (userMessageCount < 3 && !earlyFinalRequested) {
    preferredMode = "CONTINUE";
  } else if (userMessageCount >= 7 || earlyFinalRequested) {
    preferredMode = "FINAL";
  }

  return {
    userMessageCount,
    earlyFinalRequested,
    preferredMode,
  };
}

function isEarlyFinalRequest(message: string): boolean {
  return /ne düşünüyorsun|ne dusunuyorsun|sonuç ne|sonuc ne|tamam söyle|tamam soyle|kanaatin ne|yorumun ne|fikrin ne|artık söyle|artik soyle/i.test(
    message,
  );
}

function stripJsonFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject(content: string): RequestBody {
  // First attempt: parse as-is after fence stripping.
  const firstAttempt = tryParseJsonObject(content);
  if (firstAttempt) return firstAttempt;

  // Second attempt: extract the first {...} block in case the model prepended
  // or appended explanation text around the JSON.
  const match = content.match(/\{[\s\S]*\}/);
  if (match) {
    const extracted = tryParseJsonObject(match[0]);
    if (extracted) return extracted;
  }

  throw new ApiValidationError("AI response is not valid JSON.");
}

function tryParseJsonObject(content: string): RequestBody | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readString(body: RequestBody, key: string): string {
  const value = body[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiValidationError(`${key} is required.`);
  }

  return value.trim();
}

function stripSectionLabel(value: string): string {
  return value
    .replace(/^ilk izlenimim(?:\s*şu|\s*su)?\s*[:;,.-]?\s*/i, "")
    .trim();
}

function sanitizeExpectedOutcome(value: string): string {
  const riskyBenefitPattern =
    /bu sayede|sayesinde|düzelir|duzelir|daha düzenli hale gelmesi beklenir|daha duzenli hale gelmesi beklenir|satış(?:lar)? artar|satis(?:lar)? artar|tahsilat(?:ın|in)? .*düzenli|tahsilat(?:ın|in)? .*duzenli|müşteri güveni güçlenir|musteri guveni guclenir|ekip bağlanır|ekip baglanir/i;

  if (!riskyBenefitPattern.test(value)) {
    return value;
  }

  return [
    "İlk olarak konuşmada görünen alanları birbirinden ayırmaya çalışırım.",
    "Ekipteki sınır, sorumluluk ve takip meselesi müşteriye yansıyan teslim/takip sorunlarını etkiliyorsa bunu görünür hale getiririm.",
    "Eğer tahsilat gecikmeleri bu akıştan bağımsızsa, onu ayrı bir disiplin olarak ele alırım.",
  ].join(" ");
}

function keepOnlyLastQuestion(value: string): string {
  const questionCount = (value.match(/\?/g) ?? []).length;

  if (questionCount <= 1) {
    return value;
  }

  const sentences = value.match(/[^.!?\n]+[.!?]?/g) ?? [value];
  let seenQuestion = 0;
  const lastQuestionIndex = questionCount;

  return sentences
    .filter((sentence) => {
      if (!sentence.includes("?")) {
        return true;
      }

      seenQuestion += 1;
      return seenQuestion === lastQuestionIndex;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmptyMemoryContext(): MemoryContext {
  const now = new Date().toISOString();

  return {
    version: "v1",
    generatedAt: now,
    organizationId: "onboarding-discovery",
    totalIncluded: 0,
    facts: [],
    processes: [],
    strategic: [],
    preferences: [],
    highlights: [],
    conflicts: [],
  };
}
