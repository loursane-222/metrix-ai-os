// Deterministic description of HOW each provider is connected — the one
// place that knows a provider's connection method, its secure fields and
// the guidance shown to the user. The Executive never writes any of this:
// it receives the descriptor as a tool result and talks the user through
// it, so no URL, field or menu name is ever model-authored.
//
// Adding a provider means adding one entry here (and its own verify/store
// route). No secret value ever appears in a descriptor — only the shape of
// what the user must enter into the secure field.

export type IntegrationProviderName = "NYLAS" | "BIZIMHESAP";

export type SecureCredentialField = {
  // The JSON key the secure field is submitted under.
  name: string;
  label: string;
};

export type OAuthConnectionDescriptor = {
  method: "OAUTH";
  title: string;
  description: string;
  connectUrl: string;
};

export type SecureCredentialConnectionDescriptor = {
  method: "SECURE_CREDENTIAL";
  title: string;
  description: string;
  // One of NEXT's own authenticated routes, never a provider URL.
  submitUrl: string;
  submitLabel: string;
  fields: SecureCredentialField[];
  secretNotice: string;
  // Whether a real provider call has confirmed that the value the steps
  // point at actually authenticates. The screen path in `steps` may be
  // physically confirmed and still be false here: until then the value is
  // to be presented as "what to try", never as a proven credential.
  guidanceVerified: boolean;
  steps: string[];
};

export type ConnectionDescriptor =
  | OAuthConnectionDescriptor
  | SecureCredentialConnectionDescriptor;

export const CONNECTION_DESCRIPTORS: Record<
  IntegrationProviderName,
  ConnectionDescriptor
> = {
  NYLAS: {
    method: "OAUTH",
    title: "Google Hesabını Bağla",
    description:
      "Gmail ve Google Takvim'e erişim için Google'ın kendi izin ekranı açılacak. Yalnız izin verdiğin erişim alanları kullanılır.",
    connectUrl: "/api/integrations/nylas/connect"
  },
  BIZIMHESAP: {
    method: "SECURE_CREDENTIAL",
    title: "BizimHesap'ı Bağla",
    description:
      "BizimHesap'ta Ayarlar → Üyelik Bilgileri bölümündeki Api Key(FirmID) değerini aşağıdaki güvenli alana gir. METRIX değeri BizimHesap'ta doğrular, şifreli saklar ve ürün ile depo bilgilerini otomatik olarak hazırlar.",
    submitUrl: "/api/integrations/bizimhesap/connect",
    submitLabel: "Bağlan",
    // The JSON key stays `token`: the connect route sends this value as
    // BizimHesap's Token header. The label is what the user sees in their
    // own BizimHesap panel.
    fields: [{ name: "token", label: "BizimHesap Api Key(FirmID)" }],
    secretNotice:
      "Bu değer gizlidir: sohbete yazma, sesli söyleme. Yalnız aşağıdaki güvenli alana yapıştır.",
    // The screen path was confirmed by the account owner on a real
    // BizimHesap account (Ayarlar → Üyelik Bilgileri → Api Key(FirmID)).
    // That this value is accepted as the B2B Token is NOT yet confirmed —
    // BizimHesap's docs only call the Token "hesabınıza ait token", and
    // their addinvoice page uses FirmID as a separate invoice field. It
    // becomes true only after a real /warehouses call succeeds with it.
    guidanceVerified: false,
    steps: [
      "BizimHesap'a giriş yap ve Ayarlar → Üyelik Bilgileri bölümüne git.",
      "Api Key(FirmID) alanındaki değeri kopyala.",
      "Aynı ekrandaki \"Zirve Express Aktarım Api Key\" alanını kullanma; o başka bir anahtardır ve buraya girilmez.",
      "Kopyaladığın değeri sohbete yazma, sesli söyleme; aşağıdaki güvenli alana yapıştırıp Bağlan'a bas."
    ]
  }
};
