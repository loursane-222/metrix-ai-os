import { z } from "zod";

import {
  executeCustomerCreate
} from "../../actions/customer-create";
import {
  executeTaskCreate
} from "../../actions/task-create";
import {
  executeTaskUpdate
} from "../../actions/task-update";
import {
  executeQuoteCreate
} from "../../actions/quote-create";
import {
  executeQuoteUpdate
} from "../../actions/quote-update";
import {
  executeQuoteMarkWon
} from "../../actions/quote-mark-won";
import {
  executeOrderCreateFromQuote
} from "../../actions/order-create-from-quote";
import {
  executeInvoiceCreateFromOrder
} from "../../actions/invoice-create-from-order";
import {
  executeCollectionRecord
} from "../../actions/collection-record";
import {
  lookupCustomersForOrganization
} from "../../data/customer-lookup";
import {
  listTasksForOrganization
} from "../../data/task-list";
import {
  lookupProductServicesForOrganization
} from "../../data/product-service-lookup";
import {
  listQuotesForOrganization
} from "../../data/quote-lookup";
import {
  listOrdersForOrganization
} from "../../data/order-lookup";
import {
  listInvoicesForOrganization
} from "../../data/invoice-lookup";
import {
  lookupInvoiceReceivable
} from "../../data/invoice-receivable-lookup";
import {
  listCollectionsForInvoice
} from "../../data/collection-lookup";

import type {
  ExecutiveToolContext,
  MetrixTrustedToolContext
} from "../types";

export type {
  MetrixTrustedToolContext
} from "../types";

export const TaskCreateToolParameters = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Oluşturulacak görevin kısa ve açık başlığı"),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM")
    .describe("Görevin önceliği"),
  dueAt: z
    .string()
    .optional()
    .describe("Biliniyorsa ISO 8601 kesin son tarih/saat")
});

export const CustomerCreateToolParameters = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "Kullanıcının müşteri adı olarak söylediği tam ifade. " +
        "Son ekleri, kodları, numaraları veya UUID-benzeri parçaları ayırma, " +
        "kısaltma ya da normalize etme."
    ),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .describe("Kullanıcı verdiyse müşterinin e-posta adresi")
});

export const CustomerLookupToolParameters = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Aranacak müşterinin adı veya adının bilinen kısmı")
});

export const TaskListToolParameters = z.object({
  status: z
    .enum(["OPEN", "DONE", "CANCELLED"])
    .optional()
    .describe("Yalnız bu durumdaki görevleri getir"),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .optional()
    .describe("Yalnız bu öncelikteki görevleri getir"),
  dueAfter: z
    .string()
    .optional()
    .describe(
      "Yalnız bu ISO 8601 zamanından sonra (dahil) süresi dolan görevleri getir"
    ),
  dueBefore: z
    .string()
    .optional()
    .describe(
      "Yalnız bu ISO 8601 zamanından önce (dahil) süresi dolan görevleri getir. " +
        "Geciken görevler için trusted reference time'ı kullan."
    ),
  titleContains: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Görev başlığında aranacak metin, kullanıcı belirli bir " +
        "görevi tarif ettiğinde kullan"
    ),
  createdByMe: z
    .boolean()
    .optional()
    .describe(
      "true ise yalnız konuşan kullanıcının kendi oluşturduğu görevleri getir"
    ),
  assignedToMe: z
    .boolean()
    .optional()
    .describe(
      "true ise yalnız konuşan kullanıcıya atanmış görevleri getir. " +
        "\"görevlerim\", \"bana atanmış görevler\", \"bugünkü görevlerim\" " +
        "gibi kullanıcının kendi sorumluluğundaki işleri sorduğu " +
        "ownership talepleri için bunu tercih et."
    )
});

export const TaskUpdateToolParameters = z.object({
  taskId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Güncellenecek görevin task_list sonucundan alınan gerçek id'si. " +
        "Kullanıcı bir id söylemediyse önce task_list ile hedef görevi bul."
    ),
  status: z
    .enum(["OPEN", "DONE", "CANCELLED"])
    .optional()
    .describe("Görevin yeni durumu"),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .optional()
    .describe("Görevin yeni önceliği"),
  dueAt: z
    .string()
    .optional()
    .describe("Görevin yeni ISO 8601 son tarih/saati")
});

export const ProductServiceLookupToolParameters = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      "Aranacak ürün/hizmetin adı veya adının bilinen kısmı"
    ),
  type: z
    .enum(["PRODUCT", "SERVICE"])
    .optional()
    .describe(
      "Yalnız gerçekten gerekiyorsa: sonucu yalnız ürün veya yalnız " +
        "hizmet ile sınırla"
    )
});

const QuoteItemToolParameters = z.object({
  productServiceId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "product_service_lookup sonucundan alınan gerçek ürün/hizmet id'si, " +
        "biliniyorsa"
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Kalem adı"),
  unit: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .describe("Birim, örn. adet, saat, ay"),
  quantity: z
    .number()
    .describe("Miktar"),
  unitPriceCents: z
    .number()
    .describe("Birim fiyat, kuruş/cent cinsinden tam sayı"),
  discountBasisPoints: z
    .number()
    .int()
    .optional()
    .describe(
      "Kalem indirimi, baz puan cinsinden (100 = %1)"
    ),
  vatRateBasisPoints: z
    .number()
    .int()
    .optional()
    .describe("KDV oranı, baz puan cinsinden (2000 = %20)")
});

export const QuoteCreateToolParameters = z.object({
  customerId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "customer_lookup sonucundan alınan gerçek müşteri id'si. " +
        "Kullanıcı yalnız isim söylediyse önce customer_lookup ile bul."
    ),
  title: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Teklifin kısa başlığı"),
  currency: z
    .string()
    .trim()
    .length(3)
    .optional()
    .describe("ISO 4217 para birimi, örn. TRY"),
  notes: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("Dahili not"),
  customerNote: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("Müşteriye görünecek not"),
  specialTerms: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("Özel şartlar"),
  validUntil: z
    .string()
    .optional()
    .describe("Teklifin geçerlilik son tarihi, ISO 8601"),
  generalDiscountBasisPoints: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe(
      "Genel teklif indirimi, baz puan cinsinden (1000 = %10)"
    ),
  deliveryTerm: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Teslimat şartı"),
  deliveryMethod: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Teslimat yöntemi"),
  amount: z
    .number()
    .optional()
    .describe(
      "Yalnız items verilmediyse kullanılır. items verildiyse toplam " +
        "her zaman satırlardan deterministic hesaplanır; bu alan yok sayılır."
    ),
  items: z
    .array(QuoteItemToolParameters)
    .optional()
    .describe(
      "Teklif kalemleri. Verildiyse toplam bunlardan hesaplanır."
    )
});

export const QuoteLookupToolParameters = z.object({
  quoteId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Biliniyorsa tam teklif id'si"),
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Teklif başlığında veya müşteri adında aranacak metin"),
  customerId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Yalnız bu müşteriye ait teklifleri getir"),
  status: z
    .enum(["DRAFT"])
    .optional()
    .describe("Yalnız bu durumdaki teklifleri getir")
});

export const QuoteUpdateToolParameters = z.object({
  quoteId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Güncellenecek teklifin quote_lookup sonucundan alınan gerçek " +
        "id'si. Kullanıcı id söylemediyse önce quote_lookup ile hedef " +
        "teklifi bul."
    ),
  expectedUpdatedAt: z
    .string()
    .optional()
    .describe(
      "quote_lookup sonucundaki updatedAt değeri, biliniyorsa. " +
        "Verildiyse ve teklif o zamandan beri değiştiyse güncelleme " +
        "reddedilir."
    ),
  title: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Teklifin yeni başlığı"),
  notes: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("Yeni dahili not"),
  customerNote: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("Müşteriye görünecek yeni not"),
  specialTerms: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("Yeni özel şartlar"),
  validUntil: z
    .string()
    .optional()
    .describe("Yeni geçerlilik son tarihi, ISO 8601"),
  generalDiscountBasisPoints: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe("Yeni genel teklif indirimi, baz puan cinsinden"),
  deliveryTerm: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Yeni teslimat şartı"),
  deliveryMethod: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Yeni teslimat yöntemi"),
  items: z
    .array(QuoteItemToolParameters)
    .optional()
    .describe(
      "Verildiyse teklifin tüm kalem listesinin tam yerine geçer " +
        "(eksik/kısmi güncelleme değildir). Toplam yeniden hesaplanır."
    )
});

export const QuoteMarkWonToolParameters = z.object({
  quoteId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Kabul edilecek/WON yapılacak teklifin quote_lookup " +
        "sonucundan alınan gerçek id'si. Kullanıcı id söylemediyse " +
        "önce quote_lookup ile hedef teklifi bul."
    )
});

export const OrderCreateFromQuoteToolParameters = z.object({
  quoteId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Siparişe dönüştürülecek WON teklifin quote_lookup " +
        "sonucundan alınan gerçek id'si. Teklif henüz WON değilse " +
        "önce quote_mark_won ile kabul edilmelidir."
    )
});

export const OrderLookupToolParameters = z.object({
  orderId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Biliniyorsa tam sipariş id'si"),
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Sipariş numarasında, başlığında veya müşteri adında aranacak metin"
    ),
  customerId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Yalnız bu müşteriye ait siparişleri getir"),
  status: z
    .enum(["DRAFT"])
    .optional()
    .describe("Yalnız bu durumdaki siparişleri getir")
});

export const InvoiceCreateFromOrderToolParameters = z.object({
  orderId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Faturalandırılacak siparişin order_lookup sonucundan " +
        "alınan gerçek id'si. Yalnız siparişin tamamı faturalanır; " +
        "kalem alt kümesi veya miktar seçimi desteklenmez."
    )
});

export const InvoiceLookupToolParameters = z.object({
  invoiceId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Biliniyorsa tam fatura id'si"),
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Fatura numarasında veya başlığında aranacak metin"
    ),
  customerId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Yalnız bu müşteriye ait faturaları getir"),
  orderId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Yalnız bu siparişten üretilen faturayı/faturaları getir"),
  status: z
    .enum(["DRAFT"])
    .optional()
    .describe("Yalnız bu durumdaki faturaları getir")
});

export const InvoiceReceivableLookupToolParameters = z.object({
  invoiceId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Alacak/tahsilat durumu sorgulanacak faturanın invoice_lookup " +
        "sonucundan alınan gerçek id'si."
    )
});

export const CollectionRecordToolParameters = z.object({
  invoiceId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Tahsilatın kaydedileceği faturanın invoice_lookup sonucundan " +
        "alınan gerçek id'si. Kullanıcı fatura belirtmediyse veya birden " +
        "fazla makul fatura varsa önce invoice_lookup ile hedef faturayı bul."
    ),
  amount: z
    .number()
    .positive()
    .describe(
      "Bu tahsilatta alınan tutar, faturanın para birimi cinsinden " +
        "(örn. 3000 = 3.000 TL). Kuruş değil, tam para birimi tutarı. " +
        "En fazla 2 ondalık basamak."
    ),
  occurredAt: z
    .string()
    .optional()
    .describe(
      "Yalnız kullanıcı açıkça bir tahsilat tarihi/saati belirttiyse " +
        "ISO 8601 zaman. Kullanıcı belirtmediyse bu alanı gönderme; " +
        "sunucu tahsilatın gerçekleştiği anı kullanır."
    )
});

export const CollectionLookupToolParameters = z.object({
  invoiceId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Tahsilat kayıtlarının ve toplam/kalan bakiyenin getirileceği " +
        "faturanın invoice_lookup sonucundan alınan gerçek id'si."
    )
});

export type MetrixBusinessToolName =
  | "task_create"
  | "task_list"
  | "task_update"
  | "customer_create"
  | "customer_lookup"
  | "product_service_lookup"
  | "quote_create"
  | "quote_lookup"
  | "quote_update"
  | "quote_mark_won"
  | "order_create_from_quote"
  | "order_lookup"
  | "invoice_create_from_order"
  | "invoice_lookup"
  | "invoice_receivable_lookup"
  | "collection_record"
  | "collection_lookup";

type MetrixBusinessToolContract = {
  name: MetrixBusinessToolName;
  description: string;
  parameters:
    | typeof TaskCreateToolParameters
    | typeof TaskListToolParameters
    | typeof TaskUpdateToolParameters
    | typeof CustomerCreateToolParameters
    | typeof CustomerLookupToolParameters
    | typeof ProductServiceLookupToolParameters
    | typeof QuoteCreateToolParameters
    | typeof QuoteLookupToolParameters
    | typeof QuoteUpdateToolParameters
    | typeof QuoteMarkWonToolParameters
    | typeof OrderCreateFromQuoteToolParameters
    | typeof OrderLookupToolParameters
    | typeof InvoiceCreateFromOrderToolParameters
    | typeof InvoiceLookupToolParameters
    | typeof InvoiceReceivableLookupToolParameters
    | typeof CollectionRecordToolParameters
    | typeof CollectionLookupToolParameters;
};

export const TASK_CREATE_BUSINESS_TOOL = {
  name: "task_create",
  description:
    "Şirket için gerçek bir görev oluşturur. " +
    "Yalnız kullanıcı açıkça görev oluşturmak, " +
    "hatırlatılacak bir iş kaydetmek veya bir işi " +
    "takibe almak istediğinde kullan. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: TaskCreateToolParameters
} as const;

export const TASK_LIST_BUSINESS_TOOL = {
  name: "task_list",
  description:
    "Şirketin gerçek görev kayıtlarını okur. Kullanıcı açık/gecikmiş/" +
    "öncelikli/tarihli görevleri sorduğunda veya bir görevi tarife göre " +
    "bulmak (örn. güncellemek için) gerektiğinde kullan. Sonucu tahmin " +
    "etme; yalnız tool tarafından dönen görevleri şirket gerçeği olarak kullan. " +
    "Boş sonuç da geçerli bir şirket gerçeğidir.",
  parameters: TaskListToolParameters
} as const;

export const TASK_UPDATE_BUSINESS_TOOL = {
  name: "task_update",
  description:
    "Var olan gerçek bir görevin durumunu, önceliğini veya son tarihini " +
    "günceller. taskId yalnız task_list sonucundan alınmalıdır; kullanıcı " +
    "id söylemediyse önce task_list ile hedef görevi bul. Eşleşen birden " +
    "fazla görev varsa tahmin etme, kullanıcıya netleştirme sorusu sor. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: TaskUpdateToolParameters
} as const;

export const CUSTOMER_CREATE_BUSINESS_TOOL = {
  name: "customer_create",
  description:
    "Şirket için gerçek bir müşteri oluşturur. " +
    "Yalnız kullanıcı açıkça müşteri oluşturmak istediğinde kullan. " +
    "name, kullanıcının söylediği müşteri adının eksiksiz literal ifadesi olmalıdır; " +
    "isimdeki son ekleri, kodları, numaraları veya UUID-benzeri parçaları ayrı kimlik olarak yorumlama. " +
    "email yalnız kullanıcı verdiyse gönderilir. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: CustomerCreateToolParameters
} as const;

export const CUSTOMER_LOOKUP_BUSINESS_TOOL = {
  name: "customer_lookup",
  description:
    "Şirketin gerçek müşteri kayıtlarında isimle arama yapar. " +
    "Kullanıcı bir müşteri hakkında şirket kaydına dayalı bilgi " +
    "istediğinde kullan. Sonucu tahmin etme; yalnız tool tarafından " +
    "dönen müşteri kayıtlarını şirket gerçeği olarak kullan.",
  parameters: CustomerLookupToolParameters
} as const;

export const PRODUCT_SERVICE_LOOKUP_BUSINESS_TOOL = {
  name: "product_service_lookup",
  description:
    "Şirketin gerçek ürün/hizmet kayıtlarında isimle arama yapar, yalnız " +
    "ACTIVE kayıtları döndürür. Kullanıcı bir ürün/hizmet adı söylediğinde " +
    "veya teklif kalemi için gerçek kayda bağlanması gerektiğinde kullan. " +
    "Sonucu tahmin etme; yalnız tool'un döndürdüğü adayları şirket " +
    "gerçeği olarak kullan. Birden fazla anlamlı eşleşme varsa tahmin " +
    "etme, kullanıcıya sor.",
  parameters: ProductServiceLookupToolParameters
} as const;

export const QUOTE_CREATE_BUSINESS_TOOL = {
  name: "quote_create",
  description:
    "Şirket için gerçek bir teklif (quote) oluşturur. customerId " +
    "yalnız customer_lookup sonucundan alınmalıdır. items verilen her " +
    "productServiceId product_service_lookup sonucundan alınmış gerçek " +
    "bir kayda ait olmalıdır. Kalem varsa teklif toplamı her zaman " +
    "deterministic sunucu tarafı hesaplamasıdır, model toplamı vermez. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: QuoteCreateToolParameters
} as const;

export const QUOTE_LOOKUP_BUSINESS_TOOL = {
  name: "quote_lookup",
  description:
    "Şirketin gerçek tekliflerinde arama yapar veya belirli bir teklifi " +
    "kalemleriyle birlikte getirir. Bir teklifi güncellemeden önce " +
    "hedef teklifi bulmak için kullan. Sonucu tahmin etme; yalnız " +
    "tool'un döndürdüğü teklifleri şirket gerçeği olarak kullan. Boş " +
    "sonuç da geçerli bir şirket gerçeğidir.",
  parameters: QuoteLookupToolParameters
} as const;

export const QUOTE_UPDATE_BUSINESS_TOOL = {
  name: "quote_update",
  description:
    "Var olan gerçek bir teklifin başlığını, notlarını, indirimini, " +
    "geçerlilik tarihini, teslimat bilgisini veya kalemlerini günceller. " +
    "quoteId yalnız quote_lookup sonucundan alınmalıdır; kullanıcı id " +
    "söylemediyse önce quote_lookup ile hedef teklifi bul. Eşleşen " +
    "birden fazla teklif varsa tahmin etme, kullanıcıya netleştirme " +
    "sorusu sor. items verilirse mevcut tüm kalemlerin tam yerine geçer. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: QuoteUpdateToolParameters
} as const;

export const QUOTE_MARK_WON_BUSINESS_TOOL = {
  name: "quote_mark_won",
  description:
    "Var olan gerçek bir teklifi kabul edilmiş (WON) olarak işaretler. " +
    "quoteId yalnız quote_lookup sonucundan alınmalıdır. Kullanıcı " +
    "açıkça teklifi kabul ettiğini belirttiğinde veya bir DRAFT " +
    "teklifin siparişe dönüştürülmesini istediğinde (bu, teklifin " +
    "örtük kabulü anlamına gelir) kullan. Eşleşen birden fazla teklif " +
    "varsa tahmin etme, kullanıcıya sor. Başarı yalnız doğrulanmış " +
    "runtime sonucu ile vardır.",
  parameters: QuoteMarkWonToolParameters
} as const;

export const ORDER_CREATE_FROM_QUOTE_BUSINESS_TOOL = {
  name: "order_create_from_quote",
  description:
    "Yalnız WON durumundaki gerçek bir teklifi taslak (DRAFT) siparişe " +
    "dönüştürür. Teklif henüz WON değilse önce quote_mark_won ile kabul " +
    "et; bu tool teklifi kendiliğinden kabul etmez. quoteId yalnız " +
    "quote_lookup sonucundan alınmalıdır. Aynı teklif için tekrar " +
    "çağrılması yeni sipariş oluşturmaz, var olan siparişi doğrular. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: OrderCreateFromQuoteToolParameters
} as const;

export const ORDER_LOOKUP_BUSINESS_TOOL = {
  name: "order_lookup",
  description:
    "Şirketin gerçek siparişlerinde arama yapar veya belirli bir " +
    "siparişi kalemleriyle birlikte getirir. Sonucu tahmin etme; " +
    "yalnız tool'un döndürdüğü siparişleri şirket gerçeği olarak " +
    "kullan. Boş sonuç da geçerli bir şirket gerçeğidir.",
  parameters: OrderLookupToolParameters
} as const;

export const INVOICE_CREATE_FROM_ORDER_BUSINESS_TOOL = {
  name: "invoice_create_from_order",
  description:
    "Var olan gerçek bir siparişin tamamı için taslak (DRAFT) fatura " +
    "oluşturur. orderId yalnız order_lookup sonucundan alınan gerçek " +
    "bir siparişe ait olmalıdır. Yalnız siparişin tamamı faturalanır; " +
    "kısmi fatura desteklenmez. Tutarlar model tarafından hesaplanmaz " +
    "veya gönderilmez, yalnız sunucu tarafı deterministic hesaplamadır. " +
    "Aynı sipariş için tekrar çağrılması yeni fatura oluşturmaz, var " +
    "olan faturayı doğrular. Başarı yalnız doğrulanmış runtime sonucu " +
    "ile vardır.",
  parameters: InvoiceCreateFromOrderToolParameters
} as const;

export const INVOICE_LOOKUP_BUSINESS_TOOL = {
  name: "invoice_lookup",
  description:
    "Şirketin gerçek faturalarında arama yapar veya belirli bir " +
    "faturayı kalemleriyle birlikte getirir. Sonucu tahmin etme; " +
    "yalnız tool'un döndürdüğü faturaları şirket gerçeği olarak " +
    "kullan. Boş sonuç da geçerli bir şirket gerçeğidir.",
  parameters: InvoiceLookupToolParameters
} as const;

export const INVOICE_RECEIVABLE_LOOKUP_BUSINESS_TOOL = {
  name: "invoice_receivable_lookup",
  description:
    "Gerçek bir faturanın alacak/tahsilat durumunu okur: toplam tutar, " +
    "tahsil edilen tutar, kalan bakiye ve tahsilat durumu (UNPAID/" +
    "PARTIAL/PAID). Bu tool mutasyon yapmaz. Kullanıcı bir faturadan " +
    "ne kadar alacak kaldığını sorduğunda kullan. Tutarları sen " +
    "hesaplama veya tahmin etme; yalnız tool'un döndürdüğü deterministic " +
    "sonucu şirket gerçeği olarak kullan.",
  parameters: InvoiceReceivableLookupToolParameters
} as const;

export const COLLECTION_RECORD_BUSINESS_TOOL = {
  name: "collection_record",
  description:
    "Var olan gerçek bir fatura için gerçek bir müşteri tahsilatı " +
    "(collection) kaydeder. invoiceId yalnız invoice_lookup sonucundan " +
    "alınan gerçek bir faturaya ait olmalıdır. amount, faturanın kalan " +
    "bakiyesini aşamaz; aşarsa mutasyon reddedilir ve hiçbir kayıt " +
    "oluşmaz. Aynı faturaya karşı birden fazla kısmi tahsilat kaydı " +
    "meşrudur ve her biri ayrı, kalıcı bir tahsilat olayıdır. Tutarı " +
    "veya kalan bakiyeyi sen hesaplama veya söyleme; bunlar her zaman " +
    "sunucu tarafı deterministic sonuçtur. Başarı yalnız doğrulanmış " +
    "runtime sonucu ile vardır.",
  parameters: CollectionRecordToolParameters
} as const;

export const COLLECTION_LOOKUP_BUSINESS_TOOL = {
  name: "collection_lookup",
  description:
    "Gerçek bir faturaya ait tahsilat (collection) kayıtlarını, " +
    "toplam tahsil edilen tutarı ve kalan bakiyeyi okur. Sonucu " +
    "tahmin etme; yalnız tool'un döndürdüğü kayıtları şirket gerçeği " +
    "olarak kullan. Boş sonuç da geçerli bir şirket gerçeğidir.",
  parameters: CollectionLookupToolParameters
} as const;

export const METRIX_BUSINESS_TOOL_CONTRACTS: readonly MetrixBusinessToolContract[] = [
  TASK_CREATE_BUSINESS_TOOL,
  TASK_LIST_BUSINESS_TOOL,
  TASK_UPDATE_BUSINESS_TOOL,
  CUSTOMER_CREATE_BUSINESS_TOOL,
  CUSTOMER_LOOKUP_BUSINESS_TOOL,
  PRODUCT_SERVICE_LOOKUP_BUSINESS_TOOL,
  QUOTE_CREATE_BUSINESS_TOOL,
  QUOTE_LOOKUP_BUSINESS_TOOL,
  QUOTE_UPDATE_BUSINESS_TOOL,
  QUOTE_MARK_WON_BUSINESS_TOOL,
  ORDER_CREATE_FROM_QUOTE_BUSINESS_TOOL,
  ORDER_LOOKUP_BUSINESS_TOOL,
  INVOICE_CREATE_FROM_ORDER_BUSINESS_TOOL,
  INVOICE_LOOKUP_BUSINESS_TOOL,
  INVOICE_RECEIVABLE_LOOKUP_BUSINESS_TOOL,
  COLLECTION_RECORD_BUSINESS_TOOL,
  COLLECTION_LOOKUP_BUSINESS_TOOL
];

function responsesParameters(
  parameters: MetrixBusinessToolContract["parameters"]
) {
  const {
    $schema: _schema,
    ...jsonSchema
  } = z.toJSONSchema(parameters);

  return jsonSchema;
}

export const METRIX_RESPONSES_FUNCTION_TOOLS =
  METRIX_BUSINESS_TOOL_CONTRACTS.map(
    ({ name, description, parameters }) => ({
      type: "function" as const,
      name,
      description,
      parameters: responsesParameters(parameters)
    })
  );

function parseArguments(argumentsJson: string): unknown {
  return JSON.parse(argumentsJson);
}

export function metrixTrustedToolContextForExecutiveTurn(
  context: ExecutiveToolContext | undefined
): MetrixTrustedToolContext {
  if (
    !context ||
    !context.actorUserId?.trim() ||
    !context.organizationId?.trim() ||
    !context.turnId?.trim()
  ) {
    throw new Error("Trusted executive tool context is required");
  }

  return {
    actorUserId: context.actorUserId,
    organizationId: context.organizationId,
    idempotencyScope: `turn:${context.turnId}`,
    timezone: context.timezone ?? "UTC",
    referenceTimeIso:
      context.referenceTimeIso ?? new Date().toISOString()
  };
}

export async function executeMetrixBusinessTool(
  input: {
    name: MetrixBusinessToolName;
    argumentsJson: string;
    context: MetrixTrustedToolContext;
  }
): Promise<unknown> {
  switch (input.name) {
    case "task_create": {
      const args = TaskCreateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeTaskCreate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:task.create`,
        title: args.title,
        priority: args.priority,
        dueAt: args.dueAt
      });
    }

    case "task_list": {
      const args = TaskListToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const tasks =
        await listTasksForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          status: args.status,
          priority: args.priority,
          dueAfter: args.dueAfter,
          dueBefore: args.dueBefore,
          titleContains: args.titleContains,
          createdByMe: args.createdByMe,
          assignedToMe: args.assignedToMe
        });

      return {
        source: "COMPANY_REALITY",
        count: tasks.length,
        tasks
      };
    }

    case "task_update": {
      const args = TaskUpdateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeTaskUpdate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:task.update:${args.taskId}`,
        taskId: args.taskId,
        status: args.status,
        priority: args.priority,
        dueAt: args.dueAt
      });
    }

    case "product_service_lookup": {
      const args = ProductServiceLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const products =
        await lookupProductServicesForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          query: args.query,
          type: args.type
        });

      return {
        source: "COMPANY_REALITY",
        query: args.query,
        count: products.length,
        products
      };
    }

    case "quote_create": {
      const args = QuoteCreateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeQuoteCreate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:quote.create`,
        customerId: args.customerId,
        title: args.title,
        currency: args.currency,
        notes: args.notes,
        customerNote: args.customerNote,
        specialTerms: args.specialTerms,
        validUntil: args.validUntil,
        generalDiscountBasisPoints:
          args.generalDiscountBasisPoints,
        deliveryTerm: args.deliveryTerm,
        deliveryMethod: args.deliveryMethod,
        amount: args.amount,
        items: args.items
      });
    }

    case "quote_lookup": {
      const args = QuoteLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const quotes =
        await listQuotesForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          quoteId: args.quoteId,
          query: args.query,
          customerId: args.customerId,
          status: args.status
        });

      return {
        source: "COMPANY_REALITY",
        count: quotes.length,
        quotes
      };
    }

    case "quote_update": {
      const args = QuoteUpdateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeQuoteUpdate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:quote.update:${args.quoteId}`,
        quoteId: args.quoteId,
        expectedUpdatedAt: args.expectedUpdatedAt,
        title: args.title,
        notes: args.notes,
        customerNote: args.customerNote,
        specialTerms: args.specialTerms,
        validUntil: args.validUntil,
        generalDiscountBasisPoints:
          args.generalDiscountBasisPoints,
        deliveryTerm: args.deliveryTerm,
        deliveryMethod: args.deliveryMethod,
        items: args.items
      });
    }

    case "quote_mark_won": {
      const args = QuoteMarkWonToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeQuoteMarkWon({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:quote.mark_won:${args.quoteId}`,
        quoteId: args.quoteId
      });
    }

    case "order_create_from_quote": {
      const args = OrderCreateFromQuoteToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeOrderCreateFromQuote({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:order.create_from_quote:${args.quoteId}`,
        quoteId: args.quoteId
      });
    }

    case "order_lookup": {
      const args = OrderLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const orders =
        await listOrdersForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          orderId: args.orderId,
          query: args.query,
          customerId: args.customerId,
          status: args.status
        });

      return {
        source: "COMPANY_REALITY",
        count: orders.length,
        orders
      };
    }

    case "invoice_create_from_order": {
      const args = InvoiceCreateFromOrderToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeInvoiceCreateFromOrder({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:invoice.create_from_order:${args.orderId}`,
        orderId: args.orderId
      });
    }

    case "invoice_lookup": {
      const args = InvoiceLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const invoices =
        await listInvoicesForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          invoiceId: args.invoiceId,
          query: args.query,
          customerId: args.customerId,
          orderId: args.orderId,
          status: args.status
        });

      return {
        source: "COMPANY_REALITY",
        count: invoices.length,
        invoices
      };
    }

    case "invoice_receivable_lookup": {
      const args = InvoiceReceivableLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const receivable = await lookupInvoiceReceivable({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        invoiceId: args.invoiceId
      });

      return {
        source: "COMPANY_REALITY",
        receivable
      };
    }

    case "collection_record": {
      const args = CollectionRecordToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeCollectionRecord({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:collection.record:${args.invoiceId}`,
        invoiceId: args.invoiceId,
        amount: args.amount,
        occurredAt: args.occurredAt
      });
    }

    case "collection_lookup": {
      const args = CollectionLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const ledger = await listCollectionsForInvoice({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        invoiceId: args.invoiceId
      });

      return {
        source: "COMPANY_REALITY",
        ledger
      };
    }

    case "customer_create": {
      const args = CustomerCreateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeCustomerCreate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:customer.create`,
        name: args.name,
        email: args.email
      });
    }

    case "customer_lookup": {
      const args = CustomerLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const customers =
        await lookupCustomersForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          query: args.query
        });

      return {
        source: "COMPANY_REALITY",
        query: args.query,
        count: customers.length,
        customers
      };
    }
  }
}
