"use client";

import Link from "next/link";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { VoiceDiscoveryPanel } from "@/components/onboarding/voice/VoiceDiscoveryPanel";

import { MetrixChatTab } from "@/components/metrix-tab/MetrixChatTab";
import { MetrixTabScreen } from "@/components/metrix-tab/MetrixTabScreen";
import { MemorySuggestionsPanel } from "./memory-suggestions-panel";

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      status?: number;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
      status?: number;
    };

type User = {
  id: string;
  phone: string;
  fullName?: string | null;
};

type Organization = {
  id: string;
  name: string;
  onboardingStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  onboardingStep?: string | null;
  businessProfileJson?: BusinessProfile | null;
  recognitionProfileJson?: RecognitionProfile | null;
};

type SessionContext = {
  user: User;
  session: {
    id: string;
    expiresAt: string;
  };
};

type OrganizationContext = {
  user: User;
  organization: Organization;
  membership: {
    id: string;
    role: string;
  };
};

type OnboardingAnswers = {
  industry: string;
  teamSize: string;
  mainChallenge: string;
  firstGoal: string;
};

type OnboardingPhase = "welcome" | "recognition" | "activation";
type LoginAuthStep = "form" | "otp";

type RequestOtpApiResponse = {
  phone: string;
  challengeId: string;
  expiresAt: string;
  provider: string;
  devOtpCode?: string;
};
type FirstMeetingStep =
  | "executiveDiscovery"
  | "executiveInterview"
  | "executiveJudgement"
  | "executivePlan"
  | "activationRole"
  | "activationReady";

type RecognitionQuestionKey =
  | "supportAreas"
  | "mostImportantGoal"
  | "work"
  | "companySize"
  | "biggestProblem"
  | "dailyWork"
  | "hardToTrack";

type RecognitionAnswers = Record<RecognitionQuestionKey, string>;

type ExecutiveDiscoveryTurn = {
  role: "user" | "metrix";
  content: string;
};

type ExecutiveDiscoveryAnalysis = {
  firstImpression: string;
  reason: string;
  caveat: string;
  focusItems: string[];
  expectedOutcome: string;
};

type ExecutiveDiscoveryResponse = {
  mode: "CONTINUE_CONVERSATION";
  message: string;
} | ({
  mode: "FINAL_OPINION";
} & ExecutiveDiscoveryAnalysis);

type BusinessProfile = {
  answers: Partial<OnboardingAnswers>;
  updatedAt: string;
};

type RecognitionProfile = {
  industry: string;
  teamSize: string;
  businessType: string;
  priorities: string[];
  risks: string[];
  recommendedFirstSetupStep: string;
  summary: string;
  insight?: RecognitionInsight;
};

type RecognitionInsight = {
  headline: string;
  businessType: string;
  operationalPriority: string;
  mainBottleneck: string;
  recommendedFirstModule: string;
  sevenDayPlan: Array<{
    phase: string;
    title: string;
    action: string;
  }>;
  riskWarnings: string[];
  nextBestActions: string[];
  confidence: number;
  generatedBy: "deterministic";
  version: string;
};

type ActionRecommendation = {
  id: string;
  title: string;
  reason: string;
  category: string;
  module: string;
  actionType: "SETUP" | "IMPORT" | "CONFIGURE" | "CREATE" | "REVIEW";
  impactScore: number;
  urgencyScore: number;
  effortScore: number;
  priorityScore: number;
  estimatedMinutes: number;
};

type ActionEngineResult = {
  topAction: ActionRecommendation;
  recommendedActions: ActionRecommendation[];
  generatedBy: "deterministic";
  version: string;
};

type ActionExplanation = {
  actionId: string;
  summary: string;
  whyNow: string;
  evidence: string[];
  expectedOutcome: string;
  confidence: number;
  generatedBy: "deterministic";
  version: string;
};

type GuidedActionResult = {
  topActionExplanation: ActionExplanation;
  recommendedActionExplanations: ActionExplanation[];
  generatedBy: "deterministic";
  version: string;
};

type RecognitionMapSource = "onboarding" | "memory" | "inference";

type RecognitionMapItem = {
  label: string;
  value: string;
  source: RecognitionMapSource;
  confidence: number;
  isAssumption: boolean;
};

type RecognitionMapResult = {
  learnedFromUser: RecognitionMapItem[];
  inferredAboutBusiness: RecognitionMapItem[];
  assumptions: RecognitionMapItem[];
  priorities: RecognitionMapItem[];
  riskSignals: RecognitionMapItem[];
  confidence: number;
  generatedBy: "deterministic";
  version: string;
};

type MemoryItemCard = {
  id: string;
  type: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  isUserConfirmed: boolean;
  updatedAt: string;
};

type ActiveMemoryItemsResponse = {
  memoryItems: MemoryItemCard[];
  count: number;
};

type UpdateMemoryItemResponse = {
  memoryItem: MemoryItemCard;
};

type OnboardingStatusResponse = {
  onboarding: {
    user: User;
    organization: Organization;
    businessProfile: BusinessProfile | null;
  };
  recognitionProfile: RecognitionProfile | null;
  actionEngineResult: ActionEngineResult | null;
  guidedActionResult: GuidedActionResult | null;
  recognitionMapResult: RecognitionMapResult | null;
};

type OnboardingRiskSignal = {
  key: string;
  value: string;
  source: string;
  confidence: number;
};

type FirstExecutiveDecision = {
  category: string;
  title: string;
  rationale: string;
  firstAction: string;
  supportingActions: string[];
  confidence: string;
  isFallback: boolean;
};

type OnboardingExecutiveAssessment = {
  riskSignals: OnboardingRiskSignal[];
  firstExecutiveDecision: FirstExecutiveDecision | null;
};

type CompleteOnboardingResult = {
  assessment: OnboardingExecutiveAssessment | null;
};

const initialAnswers: OnboardingAnswers = {
  industry: "",
  teamSize: "",
  mainChallenge: "",
  firstGoal: "",
};

const initialRecognitionAnswers: RecognitionAnswers = {
  supportAreas: "",
  mostImportantGoal: "",
  work: "",
  companySize: "",
  biggestProblem: "",
  dailyWork: "",
  hardToTrack: "",
};

const firstMeetingSteps: FirstMeetingStep[] = [
  "executiveDiscovery",
  "executiveInterview",
  "executiveJudgement",
  "executivePlan",
  "activationRole",
  "activationReady",
];

const ENABLE_VOICE_DISCOVERY = true;
const EXECUTIVE_DISCOVERY_INVALID_FINAL_FALLBACK =
  "Metrix görüşmeyi tamamlamak için bir soru daha sormalı. Bu tabloyu en çok büyüten şey görünürlük eksikliği mi, yoksa sorumluluğun net dağılmaması mı?";

const recognitionQuestions: Array<{
  key: RecognitionQuestionKey;
  title: string;
  chips: string[];
  helper: string;
}> = [
  {
    key: "supportAreas",
    title: "Seni en çok hangi alanlarda desteklememi istersin?",
    chips: [
      "İşim",
      "Kendi işimi kurmak",
      "Satış",
      "Tahsilat",
      "Müşteri Takibi",
      "Ailem",
      "Sağlığım",
      "Spor",
      "Müzik Kariyerim",
      "Finansal Yönetim",
      "Günlük Planlama",
      "Kişisel Gelişim",
      "Eğitim",
      "Yatırımlar",
      "Seyahat",
      "Diğer",
    ],
    helper: "Bunların dışında kendi alanlarını da yazabilirsin.",
  },
  {
    key: "mostImportantGoal",
    title: "Şu sıralar hayatındaki en önemli hedef nedir?",
    chips: [
      "Kendi işimi kurmak",
      "Gelirimi artırmak",
      "Yeni müşteriler bulmak",
      "Borçlarımı kapatmak",
      "Albüm çıkarmak",
      "Daha sağlıklı olmak",
      "Finansal özgürlüğe ulaşmak",
      "Aileme daha fazla zaman ayırmak",
      "Diğer",
    ],
    helper: "Kendi hedefini de yazabilirsin.",
  },
  {
    key: "work",
    title: "Ne iş yapıyorsun?",
    chips: [
      "Satış",
      "Danışmanlık",
      "Hizmet",
      "Üretim",
      "E-ticaret",
      "Müzik",
      "Yazılım",
      "Operasyon",
      "Diğer",
    ],
    helper: "İşini kısa bir cümleyle anlatabilirsin.",
  },
  {
    key: "companySize",
    title: "Şirketinde kaç kişi çalışıyor?",
    chips: ["Sadece ben", "2-5 kişi", "6-10 kişi", "11-25 kişi", "26+ kişi"],
    helper: "Yaklaşık sayı yeterli.",
  },
  {
    key: "biggestProblem",
    title: "Şu an en büyük problemin nedir?",
    chips: [
      "Takipleri kaçırmak",
      "Öncelik belirlemek",
      "Müşteri takibi",
      "Finansal kontrol",
      "Ekip koordinasyonu",
      "Zaman yönetimi",
      "Diğer",
    ],
    helper: "En çok zorlandığın konuyu yaz.",
  },
  {
    key: "dailyWork",
    title: "Gün içinde en çok neyle uğraşıyorsun?",
    chips: [
      "Müşteri görüşmeleri",
      "Teklifler",
      "Tahsilat",
      "Planlama",
      "Ekip takibi",
      "Üretim",
      "İçerik",
      "Diğer",
    ],
    helper: "Günün en çok zaman alan işini yaz.",
  },
  {
    key: "hardToTrack",
    title: "Takip etmekte zorlandığın şey nedir?",
    chips: [
      "Müşteriler",
      "Teklifler",
      "Ödemeler",
      "Görevler",
      "Hedefler",
      "Notlar",
      "Riskler",
      "Diğer",
    ],
    helper: "AI'nın senin yerine izlemesini istediğin şeyi yaz.",
  },
];

export function MetrixOnboardingApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDevCommandCenterMode] = useState(() => {
    if (process.env.NODE_ENV !== "development") return false;
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("devCommandCenter");
  });
  const [session, setSession] = useState<SessionContext | null>(null);
  const [organizationContext, setOrganizationContext] =
    useState<OrganizationContext | null>(null);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatusResponse | null>(null);
  const [email, setEmail] = useState("");
  const [loginAuthStep, setLoginAuthStep] = useState<LoginAuthStep>("form");
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [firstMeetingStep, setFirstMeetingStep] =
    useState<FirstMeetingStep>("executiveDiscovery");
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(
    null,
  );
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [rememberMe, setRememberMe] = useState(true);
  const [organizationName, setOrganizationName] = useState("");
  const [, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase>("welcome");
  const [recognitionStep, setRecognitionStep] = useState(0);
  const [recognitionAnswers, setRecognitionAnswers] =
    useState<RecognitionAnswers>(initialRecognitionAnswers);
  const [activationDismissed, setActivationDismissed] = useState(false);
  const [v1Step, setV1Step] = useState<"reklam" | "sunum" | "paket">("reklam");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedDiscoveryAnalysis, setCapturedDiscoveryAnalysis] =
    useState<ExecutiveDiscoveryAnalysis | null>(null);
  const [capturedAssessment, setCapturedAssessment] =
    useState<OnboardingExecutiveAssessment | null>(null);

  useEffect(() => {
    void refreshContext();
  }, []);

  useEffect(() => {
    if (!resendAvailableAt) {
      setResendSecondsLeft(0);
      return;
    }

    const updateCountdown = () => {
      setResendSecondsLeft(
        Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)),
      );
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 500);

    return () => window.clearInterval(intervalId);
  }, [resendAvailableAt]);

  useEffect(() => {
    const orgId = organizationContext?.organization.id;
    if (!orgId) return;
    if (localStorage.getItem(`metrix_activation_dismissed_${orgId}`) === "1") {
      setActivationDismissed(true);
    }
  }, [organizationContext]);

  const recognitionProfile =
    onboardingStatus?.recognitionProfile ??
    organizationContext?.organization.recognitionProfileJson;
  const recognitionInsight = recognitionProfile
    ? buildRecognitionInsightViewModel(recognitionProfile)
    : null;
  const actionEngineResult = onboardingStatus?.actionEngineResult ?? null;
  const guidedActionResult = onboardingStatus?.guidedActionResult ?? null;
  const recognitionMapResult = onboardingStatus?.recognitionMapResult ?? null;
  const onboardingCompleted =
    (onboardingStatus?.onboarding.organization.onboardingStatus ??
      organizationContext?.organization.onboardingStatus) === "COMPLETED";
  const canReviewMemoryCandidates =
    organizationContext?.membership.role === "OWNER" ||
    organizationContext?.membership.role === "EXECUTIVE";
  const displayName = getDisplayName(session?.user);
  const mappedRecognitionAnswers = useMemo(
    () => mapRecognitionAnswersToBusinessAnswers(recognitionAnswers),
    [recognitionAnswers],
  );

  async function refreshContext() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const sessionResult = await apiGet<SessionContext>("/api/auth/session");
      setSession(sessionResult.ok ? sessionResult.data : null);

      if (sessionResult.ok) {
        const organizationResult = await apiGet<OrganizationContext>(
          "/api/auth/organization-context",
        );
        setOrganizationContext(
          organizationResult.ok ? organizationResult.data : null,
        );

        if (organizationResult.ok) {
          const onboardingResult = await apiGet<OnboardingStatusResponse>(
            "/api/onboarding/status",
          );
          setOnboardingStatus(
            onboardingResult.ok ? onboardingResult.data : null,
          );
        } else {
          setOnboardingStatus(null);
        }
      } else {
        setOrganizationContext(null);
        setOnboardingStatus(null);
      }
    } catch {
      setSession(null);
      setOrganizationContext(null);
      setOnboardingStatus(null);
      setErrorMessage("Oturum kontrolü tamamlanamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  }

  async function requestEmailOtp() {
    setIsSubmitting(true);
    setErrorMessage(null);

    if (!isValidEmail(email)) {
      setErrorMessage("Geçerli bir e-posta adresi girin.");
      setIsSubmitting(false);
      return;
    }

    const result = await apiPost<RequestOtpApiResponse>(
      "/api/auth/otp/request",
      { email: email.trim().toLowerCase(), rememberMe },
    );

    if (result.ok) {
      setLoginAuthStep("otp");
      setResendAvailableAt(Date.now() + 60_000);
      setDevOtpCode(result.data.devOtpCode ?? null);
    } else {
      setErrorMessage(result.error.message);
    }

    setIsSubmitting(false);
  }

  async function resendEmailOtp() {
    if (resendSecondsLeft > 0) return;
    await requestEmailOtp();
  }

  async function verifyEmailOtp(code: string) {
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await apiPost("/api/auth/otp/verify", {
      email: email.trim().toLowerCase(),
      code,
      rememberMe,
    });

    if (result.ok) {
      await refreshContext();
    } else {
      setErrorMessage((result as { ok: false; error: { message: string } }).error.message);
    }

    setIsSubmitting(false);
  }

  function changeEmail() {
    setLoginAuthStep("form");
    setResendAvailableAt(null);
    setDevOtpCode(null);
    setErrorMessage(null);
  }

  function goToNextFirstMeetingStep() {
    setFirstMeetingStep((current) => {
      const currentIndex = firstMeetingSteps.indexOf(current);
      const next = firstMeetingSteps[
        Math.min(currentIndex + 1, firstMeetingSteps.length - 1)
      ];
      // executiveJudgement is only reachable via goToExecutiveJudgementStep
      // (which validates analysis completeness). onNext must never jump to it.
      if (next === "executiveJudgement") {
        return current;
      }
      return next;
    });
  }

  function goToPreviousFirstMeetingStep() {
    setFirstMeetingStep((current) => {
      const currentIndex = firstMeetingSteps.indexOf(current);
      return firstMeetingSteps[Math.max(currentIndex - 1, 0)];
    });
  }

  function goToExecutiveJudgementStep() {
    setFirstMeetingStep("executiveJudgement");
  }

  async function createOrganization() {
    if (!session) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await apiPost("/api/onboarding/start", {
      userId: session.user.id,
      organizationName,
      country: "TR",
    });

    if (result.ok) {
      await refreshContext();
    } else {
      setErrorMessage(result.error.message);
    }

    setIsSubmitting(false);
  }

  async function saveRecognitionProgress(nextStep: number) {
    setIsSubmitting(true);
    setErrorMessage(null);

    const mappedAnswers = mapRecognitionAnswersToBusinessAnswers(recognitionAnswers);
    const result = await apiPost("/api/onboarding/save", {
      step: recognitionQuestions[Math.min(nextStep, recognitionQuestions.length - 1)].key,
      answers: mappedAnswers,
    });

    if (result.ok) {
      setAnswers(mappedAnswers);
      setRecognitionStep(nextStep);
      await refreshContext();
    } else {
      setErrorMessage(result.error.message);
    }

    setIsSubmitting(false);
  }

  async function completeRecognitionOnboarding() {
    setIsSubmitting(true);
    setErrorMessage(null);

    const mappedAnswers = mapRecognitionAnswersToBusinessAnswers(recognitionAnswers);
    const result = await apiPost<CompleteOnboardingResult>("/api/onboarding/complete", {
      answers: mappedAnswers,
      discoveryAnalysis: capturedDiscoveryAnalysis
        ? {
            firstImpression: capturedDiscoveryAnalysis.firstImpression,
            reason: capturedDiscoveryAnalysis.reason,
            caveat: capturedDiscoveryAnalysis.caveat,
            focusItems: capturedDiscoveryAnalysis.focusItems,
            expectedOutcome: capturedDiscoveryAnalysis.expectedOutcome,
            source: "EXECUTIVE_DISCOVERY" as const,
          }
        : null,
    });

    if (result.ok) {
      setCapturedAssessment(result.data.assessment);
      setAnswers(mappedAnswers);
      setOnboardingPhase("activation");
      await refreshContext();
    } else {
      setErrorMessage(result.error.message);
    }

    setIsSubmitting(false);
  }

  function dismissActivation() {
    const orgId = organizationContext?.organization.id;
    if (orgId) {
      localStorage.setItem(`metrix_activation_dismissed_${orgId}`, "1");
    }
    setActivationDismissed(true);
  }

  if (isLoading) {
    return <Shell title="METRIX">Hazirlaniyor...</Shell>;
  }

  if (isDevCommandCenterMode) {
    return (
      <MobileCommandCenter
        actionEngineResult={actionEngineResult}
        canReviewMemoryCandidates={canReviewMemoryCandidates}
        guidedActionResult={guidedActionResult}
        recognitionMapResult={recognitionMapResult}
        recognitionInsight={recognitionInsight}
      />
    );
  }

  if (!session) {
    return (
      <LoginLandingScreen
        authStep={loginAuthStep}
        devOtpCode={devOtpCode}
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onChangeEmail={changeEmail}
        onEmailChange={setEmail}
        onRequestOtp={requestEmailOtp}
        onVerifyOtp={verifyEmailOtp}
        onRememberMeChange={setRememberMe}
        onResendOtp={resendEmailOtp}
        rememberMe={rememberMe}
        resendSecondsLeft={resendSecondsLeft}
      />
    );
  }

  if (!organizationContext) {
    return (
      <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_12%_14%,rgba(99,102,241,0.18),transparent_28%),radial-gradient(circle_at_92%_18%,rgba(20,184,166,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef3ff_54%,#e9edf7_100%)] px-3 py-5 text-slate-950 sm:px-6 lg:bg-[#eceef5]">
        <div className="mx-auto flex min-h-[calc(100dvh-40px)] max-w-[430px] flex-col rounded-[34px] bg-[#fbfbfc] shadow-[0_24px_80px_rgba(15,23,42,0.16)] ring-1 ring-white/70">
          <div className="flex flex-1 flex-col px-5 pb-6 pt-7 sm:px-7">
            <header className="mb-6">
              <div className="mb-6 flex items-center justify-between text-sm font-semibold text-black">
                <span>9:41</span>
                <div className="flex items-center gap-2">
                  <IconSignal />
                  <IconWifi />
                  <IconBattery />
                </div>
              </div>

              <div className="overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white shadow-[0_20px_54px_rgba(15,23,42,0.18)]">
                <div className="mb-8 flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-teal-300 ring-1 ring-white/10">
                    <IconSparkles className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 ring-1 ring-white/10">
                    İlk kurulum
                  </span>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">
                  METRIX
                </p>
                <h1 className="mt-3 text-[31px] font-black leading-tight tracking-normal">
                  İşletmeni tanımlayalım
                </h1>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-300">
                  Metrix önce işletmenin adını öğrenir, sonra seni ve iş
                  akışını tanımaya başlar.
                </p>
              </div>
            </header>

            <section className="rounded-[24px] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <label
                className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400"
                htmlFor="organization-name"
              >
                Firma adı
              </label>
              <input
                className="mt-3 min-h-14 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[16px] font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                id="organization-name"
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder="Örnek: Metrix Teknoloji"
                value={organizationName}
              />

              {errorMessage ? (
                <div className="mt-4 rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold leading-5 text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-indigo-600 to-teal-400 px-5 text-sm font-bold text-white shadow-[0_14px_32px_rgba(79,70,229,0.22)] transition disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
                disabled={isSubmitting || organizationName.trim().length === 0}
                onClick={createOrganization}
                type="button"
              >
                {isSubmitting ? "Oluşturuluyor..." : "İşletmeyi oluştur"}
                <IconArrowRight className="h-5 w-5" />
              </button>
            </section>

            <div className="mt-auto pt-5">
              <div className="flex items-start gap-3 rounded-[20px] bg-white/80 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/70">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                  <IconLock className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold leading-5 text-slate-600">
                  Bu bilgi sadece şirket çalışma alanını kurmak için kullanılır.
                  AI önerir; son karar sende kalır.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!onboardingCompleted) {
    return (
      <V1IntroFlow
        step={v1Step}
        isSubmitting={isSubmitting}
        displayName={displayName}
        onAdvance={setV1Step}
        onComplete={completeRecognitionOnboarding}
      />
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden">
      <MetrixTabScreen />
    </div>
  );
}

// ─── V1 Intro Flow ────────────────────────────────────────────────────────────

function V1IntroFlow({
  step,
  isSubmitting,
  displayName,
  onAdvance,
  onComplete,
}: {
  step: "reklam" | "sunum" | "paket";
  isSubmitting: boolean;
  displayName: string;
  onAdvance: (next: "reklam" | "sunum" | "paket") => void;
  onComplete: () => void;
}) {
  if (step === "reklam") return <V1ReklamScreen displayName={displayName} onAdvance={() => onAdvance("sunum")} />;
  if (step === "sunum") return <V1SunumScreen onAdvance={() => onAdvance("paket")} />;
  return <V1PaketScreen isSubmitting={isSubmitting} onComplete={onComplete} />;
}

const V1_BG: React.CSSProperties = {
  background: "linear-gradient(160deg,#f9f8f5 0%,#f4f3ef 40%,#f1f0f8 100%)",
};

function V1Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 select-none" style={V1_BG}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {children}
      </div>
    </div>
  );
}

function V1Logo() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="flex items-center justify-center rounded-[28px]"
        style={{ width: 80, height: 80, background: "white", boxShadow: "0 8px 32px rgba(82,54,245,0.16),0 2px 8px rgba(0,0,0,0.06)" }}
      >
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
          <rect x="6" y="6" width="36" height="36" rx="10" fill="#5236F5" opacity="0.10" />
          <path d="M12 36L18 20L24 30L30 20L36 36" stroke="#5236F5" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="14" r="4" fill="#5236F5" />
        </svg>
      </div>
      <span className="font-black tracking-[0.22em] uppercase text-[13px]" style={{ color: "#5236F5" }}>METRIX</span>
    </div>
  );
}

function V1Button({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 rounded-2xl font-bold text-[15px] tracking-wide transition disabled:opacity-50"
      style={{ color: "#5236F5", background: "rgba(82,54,245,0.08)", border: "1px solid rgba(82,54,245,0.22)" }}
      type="button"
    >
      {children}
    </button>
  );
}

function V1ReklamScreen({ displayName, onAdvance }: { displayName: string; onAdvance: () => void }) {
  return (
    <V1Shell>
      <V1Logo />
      <div className="w-full rounded-[24px] bg-white p-6 shadow-[0_8px_32px_rgba(82,54,245,0.10)]">
        <p className="text-[22px] font-black leading-snug text-slate-900">
          {displayName ? `Merhaba ${displayName}` : "Merhaba"} 👋
        </p>
        <p className="mt-3 text-[15px] font-medium leading-6 text-slate-500">
          Metrix, şirketinin AI Genel Müdürü. Günlük kararlarında yanında, öncelikleri netleştiriyor, riskleri önceden görüyor.
        </p>
      </div>
      <V1Button onClick={onAdvance}>Devam Et →</V1Button>
    </V1Shell>
  );
}

function V1SunumScreen({ onAdvance }: { onAdvance: () => void }) {
  const items = [
    { icon: "⚡", text: "Bugünkü odakta ne yapman gerektiğini söyler" },
    { icon: "🎯", text: "Şirketin önceliklerini ve risklerini takip eder" },
    { icon: "💬", text: "Her soruya anlık, bağlama göre yanıt verir" },
    { icon: "📊", text: "Haftalık özet ve aksiyon planı çıkarır" },
  ];
  return (
    <V1Shell>
      <V1Logo />
      <div className="w-full rounded-[24px] bg-white p-6 shadow-[0_8px_32px_rgba(82,54,245,0.10)]">
        <p className="text-[18px] font-black text-slate-900">Metrix ile neler yapabilirsin?</p>
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.icon} className="flex items-start gap-3">
              <span className="text-[20px] leading-none mt-0.5">{item.icon}</span>
              <span className="text-[14px] font-medium leading-5 text-slate-600">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <V1Button onClick={onAdvance}>Devam Et →</V1Button>
    </V1Shell>
  );
}

function V1PaketScreen({ isSubmitting, onComplete }: { isSubmitting: boolean; onComplete: () => void }) {
  return (
    <V1Shell>
      <V1Logo />
      <div className="w-full rounded-[24px] bg-white p-6 shadow-[0_8px_32px_rgba(82,54,245,0.10)] text-center">
        <div className="text-[40px] leading-none mb-3">🎉</div>
        <p className="text-[20px] font-black text-slate-900">Erken Erişim Aktif</p>
        <p className="mt-2 text-[14px] font-medium leading-5 text-slate-500">
          Beta programına hoş geldin. Hesabın şu an erken erişim kapsamında aktif edildi.
        </p>
      </div>
      <V1Button onClick={onComplete} disabled={isSubmitting}>
        {isSubmitting ? "Hazırlanıyor..." : "Metrix'i Kullan →"}
      </V1Button>
    </V1Shell>
  );
}

// ─── End V1 Intro Flow ────────────────────────────────────────────────────────

function LockedOnboardingFlow({
  answers,
  displayName,
  errorMessage,
  isSubmitting,
  onAnswerChange,
  onBack,
  onComplete,
  onSaveProgress,
  onStart,
  phase,
  stepIndex,
}: {
  answers: RecognitionAnswers;
  displayName: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onAnswerChange: (key: RecognitionQuestionKey, value: string) => void;
  onBack: () => void;
  onComplete: () => void;
  onSaveProgress: (nextStep: number) => void;
  onStart: () => void;
  phase: OnboardingPhase;
  stepIndex: number;
}) {
  if (phase === "welcome") {
    return (
      <OnboardingWelcomeScreen displayName={displayName} onStart={onStart} />
    );
  }

  return (
    <RecognitionChatScreen
      answers={answers}
      displayName={displayName}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      onAnswerChange={onAnswerChange}
      onBack={onBack}
      onComplete={onComplete}
      onSaveProgress={onSaveProgress}
      stepIndex={stepIndex}
    />
  );
}

function FirstMeetingFlow({
  onBack,
  onAnalysisCaptured,
  onExecutiveJudgement,
  onNext,
  step,
}: {
  onBack: () => void;
  onAnalysisCaptured: (analysis: ExecutiveDiscoveryAnalysis) => void;
  onExecutiveJudgement: () => void;
  onNext: () => void;
  step: FirstMeetingStep;
}) {
  const [turns, setTurns] = useState<ExecutiveDiscoveryTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState<ExecutiveDiscoveryAnalysis | null>(
    null,
  );
  const [isThinking, setIsThinking] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [voiceFallbackRequested, setVoiceFallbackRequested] = useState(false);
  const latestTurnRef = useRef<HTMLDivElement | null>(null);
  const stepIndex = firstMeetingSteps.indexOf(step);
  const canGoBack = stepIndex > 0;
  const progressLabel = getFirstMeetingProgressLabel(step);
  const isConversationStep =
    step === "executiveDiscovery" || step === "executiveInterview";

  useEffect(() => {
    const latestTurn = turns.at(-1);

    if (!latestTurn) {
      return;
    }

    window.requestAnimationFrame(() => {
      latestTurnRef.current?.scrollIntoView({
        behavior: "smooth",
        block: latestTurn.role === "metrix" ? "start" : "nearest",
      });
    });
  }, [turns]);

  async function submitDiscoveryAnswer() {
    const answer = draft.trim();

    if (!answer) {
      return;
    }

    const nextTurns: ExecutiveDiscoveryTurn[] = [
      ...turns,
      { role: "user", content: answer },
    ];

    setTurns(nextTurns);
    setDraft("");
    await requestExecutiveDiscovery(nextTurns, () => onExecutiveJudgement());
  }

  async function submitInterviewAnswer() {
    const answer = draft.trim();

    if (!answer) {
      return;
    }

    const nextTurns: ExecutiveDiscoveryTurn[] = [
      ...turns,
      { role: "user", content: answer },
    ];

    setTurns(nextTurns);
    setDraft("");
    await requestExecutiveDiscovery(nextTurns, () => onNext());
  }

  function acceptFinalOpinion(
    candidateAnalysis: ExecutiveDiscoveryAnalysis,
    goToJudgement: () => void,
    fallbackTurns: ExecutiveDiscoveryTurn[] = turns,
  ) {
    if (!isCompleteExecutiveDiscoveryAnalysis(candidateAnalysis)) {
      setTurns([
        ...fallbackTurns,
        {
          role: "metrix",
          content: EXECUTIVE_DISCOVERY_INVALID_FINAL_FALLBACK,
        },
      ]);
      setDiscoveryError(null);

      if (step === "executiveDiscovery") {
        onNext();
      }

      return;
    }

    setAnalysis(candidateAnalysis);
    onAnalysisCaptured(candidateAnalysis);
    goToJudgement();
  }

  async function requestExecutiveDiscovery(
    nextTurns: ExecutiveDiscoveryTurn[],
    goToJudgement: () => void,
  ) {
    if (isThinking) {
      return;
    }

    setIsThinking(true);
    setDiscoveryError(null);

    let response: ApiResponse<ExecutiveDiscoveryResponse>;

    try {
      response = await apiPost<ExecutiveDiscoveryResponse>(
        "/api/onboarding/discovery",
        {
          turns: nextTurns,
        },
      );
    } catch {
      setIsThinking(false);
      setDiscoveryError("Metrix şu anda cevap üretemedi. Tekrar dener misin?");
      return;
    }

    setIsThinking(false);

    if (!response.ok) {
      setDiscoveryError(response.error.message);
      return;
    }

    if (response.data.mode === "CONTINUE_CONVERSATION") {
      setTurns([
        ...nextTurns,
        { role: "metrix", content: response.data.message },
      ]);

      if (step === "executiveDiscovery") {
        onNext();
      }

      return;
    }

    if (response.data.mode === "FINAL_OPINION") {
      acceptFinalOpinion(
        {
          firstImpression: response.data.firstImpression,
          reason: response.data.reason,
          caveat: response.data.caveat,
          focusItems: response.data.focusItems,
          expectedOutcome: response.data.expectedOutcome,
        },
        goToJudgement,
        nextTurns,
      );
      return;
    }

    setDiscoveryError("Metrix ilk yorumu oluşturamadı. Tekrar dener misin?");
  }

  return (
    <FirstMeetingShell>
      <div className="flex h-full min-h-0 flex-col px-5 pb-5 pt-4 text-[#071226]">
        <PhoneStatusBar />
        <FirstMeetingHeader
          canGoBack={canGoBack}
          onBack={onBack}
          progressLabel={progressLabel}
          stepIndex={stepIndex}
        />

        {isConversationStep ? (
          <ExecutiveConversationStep
            draft={draft}
            error={discoveryError}
            isThinking={isThinking}
            latestTurnRef={latestTurnRef}
            onDraftChange={setDraft}
            onSubmit={
              step === "executiveDiscovery"
                ? submitDiscoveryAnswer
                : submitInterviewAnswer
            }
            onVoiceContinueConversation={() => {
              // Voice session manages conversation internally.
              // Steps must never advance on CONTINUE — only on FINAL_OPINION.
            }}
            onVoiceError={setDiscoveryError}
            onVoiceFallback={() => setVoiceFallbackRequested(true)}
            onReturnToVoice={
              ENABLE_VOICE_DISCOVERY
                ? () => setVoiceFallbackRequested(false)
                : undefined
            }
            onVoiceFinalOpinion={(voiceAnalysis) => {
              acceptFinalOpinion(voiceAnalysis, () => {
                if (step === "executiveDiscovery") {
                  onExecutiveJudgement();
                } else {
                  onNext();
                }
              });
            }}
            onVoiceTurnsChange={setTurns}
            turns={turns}
            voiceEnabled={ENABLE_VOICE_DISCOVERY && !voiceFallbackRequested}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
            {step === "executiveJudgement" && analysis ? (
              <ExecutiveJudgementStep analysis={analysis} onNext={onNext} />
            ) : null}

            {step === "executivePlan" && analysis ? (
              <ExecutivePlanStep analysis={analysis} onNext={onNext} />
            ) : null}

            {step === "activationRole" ? (
              <ActivationRoleStep onNext={onNext} />
            ) : null}

            {step === "activationReady" ? <ActivationReadyStep /> : null}
          </div>
        )}
      </div>
    </FirstMeetingShell>
  );
}

function FirstMeetingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-[#071226] px-0 py-0 text-[#071226] sm:px-4 sm:py-4">
      <div className="mx-auto h-[100dvh] max-h-[932px] w-full max-w-[430px] overflow-hidden bg-[linear-gradient(180deg,#fffaf2_0%,#fffdf8_47%,#f7efe4_100%)] shadow-[0_28px_90px_rgba(0,0,0,0.34)] ring-1 ring-white/70 sm:rounded-[42px]">
        {children}
      </div>
    </main>
  );
}

function ExecutiveConversationStep({
  draft,
  error,
  isThinking,
  latestTurnRef,
  onDraftChange,
  onSubmit,
  onVoiceContinueConversation,
  onVoiceError,
  onVoiceFallback,
  onVoiceFinalOpinion,
  onVoiceTurnsChange,
  onReturnToVoice,
  turns,
  voiceEnabled,
}: {
  draft: string;
  error: string | null;
  isThinking: boolean;
  latestTurnRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onVoiceContinueConversation: (message: string) => void;
  onVoiceError: (message: string) => void;
  onVoiceFallback: () => void;
  onVoiceFinalOpinion: (analysis: ExecutiveDiscoveryAnalysis) => void;
  onVoiceTurnsChange: (turns: ExecutiveDiscoveryTurn[]) => void;
  onReturnToVoice?: () => void;
  turns: ExecutiveDiscoveryTurn[];
  voiceEnabled: boolean;
}) {
  const hasConversation = turns.length > 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col pt-4">
      {voiceEnabled ? (
        <VoiceDiscoveryPanel
          onContinueConversation={onVoiceContinueConversation}
          onError={onVoiceError}
          onFinalOpinion={onVoiceFinalOpinion}
          onTextFallback={onVoiceFallback}
          onTurnsChange={onVoiceTurnsChange}
          turns={turns}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-6 pb-6">
              {!hasConversation ? (
                <ExecutiveDiscoveryIntro />
              ) : (
                turns.map((turn, index) => (
                  <ExecutiveConversationTurn
                    isLatest={index === turns.length - 1}
                    key={`${turn.role}-${index}-${turn.content}`}
                    ref={index === turns.length - 1 ? latestTurnRef : undefined}
                    turn={turn}
                  />
                ))
              )}
              {isThinking ? <ExecutiveThinkingNote /> : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-[#ead7bf] bg-[#f7efe4]/92 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-4 backdrop-blur">
            <ExecutiveDiscoveryTextarea
              onChange={onDraftChange}
              placeholder={
                hasConversation
                  ? "Cevabını yaz."
                  : "Buraya rahatça yazabilirsin..."
              }
              variant={hasConversation ? "compact" : "dominant"}
              value={draft}
            />
            <FirstMeetingPrimaryButton
              compact
              disabled={
                draft.trim().length < (hasConversation ? 3 : 8) || isThinking
              }
              label={isThinking ? "Düşünüyorum" : "Metrix'e Anlat"}
              onClick={onSubmit}
            />
            {error ? <FirstMeetingErrorMessage message={error} /> : null}
            {onReturnToVoice ? (
              <button
                className="mt-2 flex h-9 w-full items-center justify-center rounded-[14px] border border-[#d4c5ad] bg-transparent px-3 text-[13px] font-bold text-[#8a5a2b]"
                onClick={onReturnToVoice}
                type="button"
              >
                Tekrar sesli devam et
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function ExecutiveDiscoveryIntro() {
  return (
    <div className="pt-2">
      <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#8a5a2b]">
        Metrix
      </p>
      <p className="mt-4 text-[19px] font-black leading-7 text-[#071226]">
        Birlikte çalışmadan önce seni ve şirketini biraz tanımak istiyorum.
      </p>
      <p className="mt-3 text-[16px] font-semibold leading-7 text-[#695b4d]">
        Bana şirketinden ve son dönemde seni en çok zorlayan konulardan biraz
        bahseder misin?
      </p>
    </div>
  );
}

const ExecutiveConversationTurn = forwardRef<
  HTMLDivElement,
  {
    isLatest: boolean;
    turn: ExecutiveDiscoveryTurn;
  }
>(function ExecutiveConversationTurn({ isLatest, turn }, ref) {
  const isMetrix = turn.role === "metrix";

  return (
    <article
      className={`border-l-2 pl-4 ${
        isMetrix ? "border-[#8a5a2b]" : "border-[#d8c3aa]"
      }`}
      ref={ref}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#8a5a2b]">
          {isMetrix ? "Metrix" : "Sen"}
        </p>
        {isLatest ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[#8a5a2b]" />
        ) : null}
      </div>
      <p
        className={`mt-2 whitespace-pre-line leading-7 ${
          isMetrix
            ? "text-[17px] font-black text-[#071226]"
            : "text-[15px] font-semibold text-[#55483b]"
        }`}
      >
        {turn.content}
      </p>
    </article>
  );
});

function ExecutiveThinkingNote() {
  return (
    <div className="border-l-2 border-[#d9ad7a] pl-4">
      <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#8a5a2b]">
        Metrix
      </p>
      <p className="mt-2 text-[15px] font-black leading-6 text-[#071226]">
        Düşünüyorum...
      </p>
    </div>
  );
}

function FirstMeetingHeader({
  canGoBack,
  onBack,
  progressLabel,
  stepIndex,
}: {
  canGoBack: boolean;
  onBack: () => void;
  progressLabel: string;
  stepIndex: number;
}) {
  const indicatorCount = stepIndex <= 6 ? 5 : 4;
  const activeIndicator = stepIndex <= 6 ? Math.min(stepIndex, 5) : stepIndex - 6;

  return (
    <header className="mt-4 flex shrink-0 items-center justify-between">
      <button
        aria-label="Geri"
        className="grid h-11 w-11 place-items-center rounded-full border border-[#ead7bf] bg-white/72 text-[#071226] shadow-[0_12px_28px_rgba(7,18,38,0.07)] disabled:opacity-0"
        disabled={!canGoBack}
        onClick={onBack}
        type="button"
      >
        <IconBack className="h-5 w-5" />
      </button>
      <div className="text-center">
        <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#8a5a2b]">
          Metrix
        </p>
        <p className="mt-1 text-[13px] font-bold text-[#756656]">
          {progressLabel}
        </p>
      </div>
      <div className="flex h-11 w-16 items-center justify-end gap-1.5">
        {Array.from({ length: indicatorCount }).map((_, index) => (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              index < Math.max(activeIndicator, 0)
                ? "bg-[#071226]/70"
                : "bg-[#d8c3aa]/70"
            }`}
            key={index}
          />
        ))}
      </div>
    </header>
  );
}

function FirstMeetingErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-[16px] border border-[#e4b4a4] bg-[#fff5f1] px-4 py-3 text-[13px] font-bold leading-5 text-[#8c3324]">
      {message}
    </p>
  );
}

function ExecutiveDiscoveryTextarea({
  onChange,
  placeholder,
  variant = "compact",
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  variant?: "compact" | "dominant";
  value: string;
}) {
  return (
    <textarea
      className={`${variant === "dominant" ? "min-h-[248px]" : "h-[118px]"} w-full resize-none rounded-[20px] border border-[#d9ad7a] bg-[#fffaf2] px-4 py-3 text-[16px] font-bold leading-6 text-[#071226] outline-none transition placeholder:text-[#a99a89] focus:border-[#a66d35] focus:shadow-[0_0_0_4px_rgba(166,109,53,0.13)]`}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}

function buildAssessmentSummaryText(
  analysis: ExecutiveDiscoveryAnalysis,
): string {
  const firstSentence = (text: string): string => {
    const match = text.match(/^[^.!?]+[.!?]?/);
    const s = (match?.[0]?.trim() ?? text.trim()).replace(/\.?\s*$/, "");
    return s + ".";
  };

  const step = firstSentence(
    analysis.focusItems[0] ?? analysis.expectedOutcome,
  );

  return [
    "İlk izlenimim şu.",
    firstSentence(analysis.firstImpression),
    firstSentence(analysis.reason),
    `Dikkat etmeni istediğim bir konu var: ${firstSentence(analysis.caveat)}`,
    `İlk adım olarak şunu öneriyorum: ${step}`,
    "Bunu zamanla birlikte netleştireceğiz.",
  ].join(" ");
}

function ExecutiveJudgementStep({
  analysis,
  onNext,
}: {
  analysis: ExecutiveDiscoveryAnalysis;
  onNext: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const summaryText = useRef(buildAssessmentSummaryText(analysis));
  const [ttsState, setTtsState] = useState<
    "loading" | "ready" | "playing" | "done" | "error"
  >("loading");

  useEffect(() => {
    const audio = audioRef.current;
    let cancelled = false;

    fetch("/api/onboarding/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summaryText.current }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob || !audio) {
          if (!cancelled) setTtsState("error");
          return;
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        audio.src = url;
        audio.onended = () => {
          if (!cancelled) setTtsState("done");
        };
        audio.onerror = () => {
          if (!cancelled) setTtsState("error");
        };
        audio.load();
        void audio
          .play()
          .then(() => {
            if (!cancelled) setTtsState("playing");
          })
          .catch(() => {
            if (!cancelled) setTtsState("ready");
          });
      })
      .catch(() => {
        if (!cancelled) setTtsState("error");
      });

    return () => {
      cancelled = true;
      if (audio && !audio.paused) audio.pause();
      const url = blobUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
        blobUrlRef.current = null;
      }
    };
  }, []);

  function handlePlayResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (ttsState === "done") audio.currentTime = 0;
    void audio
      .play()
      .then(() => setTtsState("playing"))
      .catch(() => {});
  }

  return (
    <section className="pb-6">
      <h1 className="mt-2 text-[31px] font-black leading-tight tracking-normal text-[#071226]">
        İlk izlenimim şu...
      </h1>

      {ttsState === "loading" ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
          <span className="text-[13px] font-semibold text-[#8a5a2b]">
            Sesli özet hazırlanıyor...
          </span>
        </div>
      ) : ttsState === "playing" ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
          <span className="text-[13px] font-semibold text-[#8a5a2b]">
            Metrix konuşuyor...
          </span>
        </div>
      ) : ttsState === "ready" || ttsState === "done" ? (
        <button
          className="mt-4 flex items-center gap-2 rounded-[14px] border border-[#d4c5ad] bg-[#fdf8f2] px-3 py-2 text-[13px] font-bold text-[#3d2c14]"
          onClick={handlePlayResume}
          type="button"
        >
          ▶ {ttsState === "done" ? "Tekrar dinle" : "Sesli özeti dinle"}
        </button>
      ) : null}

      <div className="mt-6 space-y-3">
        <ExecutiveJudgementBlock value={analysis.firstImpression} />
        <ExecutiveJudgementBlock
          label="Bunu düşünmemin sebebi..."
          value={analysis.reason}
        />
        <ExecutiveJudgementBlock
          label="Yanılıyor olabilirim ama..."
          value={analysis.caveat}
        />
      </div>
      <FirstMeetingPrimaryButton label="Devam Et" onClick={onNext} />
      <audio
        playsInline
        preload="auto"
        ref={audioRef}
        style={{ display: "none" }}
      />
    </section>
  );
}

function ExecutiveJudgementBlock({
  label,
  value,
}: {
  label?: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-[#ead7bf] bg-white/78 px-4 py-4 shadow-[0_12px_28px_rgba(7,18,38,0.06)]">
      {label ? (
        <p className="mb-2 text-[12px] font-black uppercase tracking-[0.13em] text-[#8a5a2b]">
          {label}
        </p>
      ) : null}
      <p className="text-[16px] font-bold leading-7 text-[#071226]">{value}</p>
    </div>
  );
}

function buildPlanSummaryText(analysis: ExecutiveDiscoveryAnalysis): string {
  const firstSentence = (text: string): string => {
    const match = text.match(/^[^.!?]+[.!?]?/);
    const s = (match?.[0]?.trim() ?? text.trim()).replace(/\.?\s*$/, "");
    return s + ".";
  };

  const items = analysis.focusItems.map(firstSentence).join(" ");

  return [
    "İşte ilk çalışma planım.",
    `Önce şu üç konuya bakacağım: ${items}`,
    `Başlangıç noktam: ${firstSentence(analysis.expectedOutcome)}`,
  ].join(" ");
}

function ExecutivePlanStep({
  analysis,
  onNext,
}: {
  analysis: ExecutiveDiscoveryAnalysis;
  onNext: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const summaryText = useRef(buildPlanSummaryText(analysis));
  const [ttsState, setTtsState] = useState<
    "loading" | "ready" | "playing" | "done" | "error"
  >("loading");

  useEffect(() => {
    const audio = audioRef.current;
    let cancelled = false;

    fetch("/api/onboarding/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summaryText.current }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob || !audio) {
          if (!cancelled) setTtsState("error");
          return;
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        audio.src = url;
        audio.onended = () => {
          if (!cancelled) setTtsState("done");
        };
        audio.onerror = () => {
          if (!cancelled) setTtsState("error");
        };
        audio.load();
        void audio
          .play()
          .then(() => {
            if (!cancelled) setTtsState("playing");
          })
          .catch(() => {
            if (!cancelled) setTtsState("ready");
          });
      })
      .catch(() => {
        if (!cancelled) setTtsState("error");
      });

    return () => {
      cancelled = true;
      if (audio && !audio.paused) audio.pause();
      const url = blobUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
        blobUrlRef.current = null;
      }
    };
  }, []);

  function handlePlayResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (ttsState === "done") audio.currentTime = 0;
    void audio
      .play()
      .then(() => setTtsState("playing"))
      .catch(() => {});
  }

  return (
    <section className="pb-6">
      <h1 className="mt-2 text-[31px] font-black leading-tight tracking-normal text-[#071226]">
        İlk çalışma planım
      </h1>

      {ttsState === "loading" ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
          <span className="text-[13px] font-semibold text-[#8a5a2b]">
            Sesli özet hazırlanıyor...
          </span>
        </div>
      ) : ttsState === "playing" ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
          <span className="text-[13px] font-semibold text-[#8a5a2b]">
            Metrix konuşuyor...
          </span>
        </div>
      ) : ttsState === "ready" || ttsState === "done" ? (
        <button
          className="mt-4 flex items-center gap-2 rounded-[14px] border border-[#d4c5ad] bg-[#fdf8f2] px-3 py-2 text-[13px] font-bold text-[#3d2c14]"
          onClick={handlePlayResume}
          type="button"
        >
          ▶ {ttsState === "done" ? "Tekrar dinle" : "Sesli özeti dinle"}
        </button>
      ) : null}

      <p className="mt-5 text-[17px] font-black leading-7 text-[#071226]">
        Şimdi ilk olarak şunlara bakmak isterim:
      </p>
      <div className="mt-5 space-y-3">
        {analysis.focusItems.map((item) => (
          <div
            className="flex min-h-[52px] items-start gap-3 rounded-[16px] border border-[#ead7bf] bg-white/76 px-4 py-3 shadow-[0_10px_24px_rgba(7,18,38,0.05)]"
            key={item}
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#8a5a2b]" />
            <p className="text-[15px] font-bold leading-6 text-[#071226]">
              {item}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[20px] bg-[#fff4e3] px-5 py-4 text-left">
        <p className="text-[12px] font-black uppercase tracking-[0.13em] text-[#8a5a2b]">
          Önce şu ayrımı yaparım
        </p>
        <p className="mt-2 text-[16px] font-black leading-7 text-[#071226]">
          {analysis.expectedOutcome}
        </p>
      </div>
      <FirstMeetingPrimaryButton label="Devam Et" onClick={onNext} />
      <audio
        playsInline
        preload="auto"
        ref={audioRef}
        style={{ display: "none" }}
      />
    </section>
  );
}

function ActivationRoleStep({ onNext }: { onNext: () => void }) {
  const roleItems = [
    "Şirketindeki önemli konuları takip edeceğim.",
    "Riskleri senden önce fark etmeye çalışacağım.",
    "Görevlerin ve kararların unutulmasına izin vermeyeceğim.",
    "Operasyonlarını daha görünür hale getireceğim.",
    "Her gün neye odaklanman gerektiğini söyleyeceğim.",
  ];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const summaryText = useRef(
    [
      "Artık arkanda çalışan bir yönetim ekibi var.",
      ...roleItems,
    ].join(" "),
  );
  const [ttsState, setTtsState] = useState<
    "loading" | "ready" | "playing" | "done" | "error"
  >("loading");

  useEffect(() => {
    const audio = audioRef.current;
    let cancelled = false;

    fetch("/api/onboarding/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summaryText.current }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob || !audio) {
          if (!cancelled) setTtsState("error");
          return;
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        audio.src = url;
        audio.onended = () => { if (!cancelled) setTtsState("done"); };
        audio.onerror = () => { if (!cancelled) setTtsState("error"); };
        audio.load();
        void audio
          .play()
          .then(() => { if (!cancelled) setTtsState("playing"); })
          .catch(() => { if (!cancelled) setTtsState("ready"); });
      })
      .catch(() => { if (!cancelled) setTtsState("error"); });

    return () => {
      cancelled = true;
      if (audio && !audio.paused) audio.pause();
      const url = blobUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
        blobUrlRef.current = null;
      }
    };
  }, []);

  function handlePlayResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (ttsState === "done") audio.currentTime = 0;
    void audio
      .play()
      .then(() => setTtsState("playing"))
      .catch(() => {});
  }

  return (
    <section className="pb-6">
      <h1 className="mt-2 text-[32px] font-black leading-tight tracking-normal text-[#071226]">
        Artık arkanda çalışan bir yönetim ekibi var.
      </h1>

      {ttsState === "loading" ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
          <span className="text-[13px] font-semibold text-[#8a5a2b]">
            Sesli özet hazırlanıyor...
          </span>
        </div>
      ) : ttsState === "playing" ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a5a2b]" />
          <span className="text-[13px] font-semibold text-[#8a5a2b]">
            Metrix konuşuyor...
          </span>
        </div>
      ) : ttsState === "ready" || ttsState === "done" ? (
        <button
          className="mt-4 flex items-center gap-2 rounded-[14px] border border-[#d4c5ad] bg-[#fdf8f2] px-3 py-2 text-[13px] font-bold text-[#3d2c14]"
          onClick={handlePlayResume}
          type="button"
        >
          ▶ {ttsState === "done" ? "Tekrar dinle" : "Sesli özeti dinle"}
        </button>
      ) : null}

      <div className="mt-7 space-y-3">
        {roleItems.map((item) => (
          <div
            className="flex min-h-[48px] items-start gap-3 rounded-[16px] border border-[#ead7bf] bg-white/76 px-4 py-3 shadow-[0_10px_24px_rgba(7,18,38,0.05)]"
            key={item}
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#8a5a2b]" />
            <p className="text-[15px] font-bold leading-6 text-[#071226]">
              {item}
            </p>
          </div>
        ))}
      </div>
      <FirstMeetingPrimaryButton label="Devam Et" onClick={onNext} />
      <audio playsInline preload="auto" ref={audioRef} style={{ display: "none" }} />
    </section>
  );
}

function ActivationReadyStep() {
  const [isActivated, setIsActivated] = useState(false);

  return (
    <section className="pb-8 text-center">
      <h1 className="mx-auto mt-2 max-w-[330px] text-[32px] font-black leading-tight tracking-normal text-[#071226]">
        Metrix seninle çalışmaya hazır.
      </h1>
      <div className="mx-auto mt-7 h-1 w-12 rounded-full bg-[#b47a3c]" />
      <p className="mx-auto mt-8 max-w-[320px] text-[18px] font-black leading-7 text-[#071226]">
        İlk değerlendirmemi tamamladım.
      </p>
      <p className="mx-auto mt-5 max-w-[320px] text-[16px] font-semibold leading-7 text-[#695b4d]">
        Şirketini tanıdıkça daha net öneriler vereceğim, görevleri takip
        edeceğim ve önemli konuları gözden kaçırmamaya çalışacağım.
      </p>
      <button
        className="mt-10 flex h-[56px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#071226] text-[17px] font-black text-white shadow-[0_22px_42px_rgba(7,18,38,0.34)]"
        onClick={() => setIsActivated(true)}
        type="button"
      >
        Metrix&apos;i Aktifleştir
        <IconArrowRight className="h-6 w-6" />
      </button>
      {isActivated ? (
        <p className="mt-4 rounded-[16px] bg-[#fff4e3] px-4 py-3 text-[13px] font-bold leading-5 text-[#6f4b26]">
          Hazırım. Bir sonraki adımda aktivasyonu tamamlayacağız.
        </p>
      ) : null}
    </section>
  );
}

function FirstMeetingPrimaryButton({
  compact = false,
  disabled = false,
  label,
  onClick,
}: {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${compact ? "mt-4" : "mt-8"} flex h-[56px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#071226] text-[17px] font-black text-white shadow-[0_22px_42px_rgba(7,18,38,0.34)] transition disabled:cursor-not-allowed disabled:bg-[#8f877c] disabled:shadow-none`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
      <IconArrowRight className="h-6 w-6" />
    </button>
  );
}

function getFirstMeetingProgressLabel(step: FirstMeetingStep): string {
  if (step === "executiveDiscovery" || step === "executiveInterview") {
    return "Görüşme";
  }

  if (step === "executiveJudgement") {
    return "İlk değerlendirme";
  }

  if (step === "executivePlan") {
    return "Çalışma planı";
  }

  return "Aktivasyon";
}

function isCompleteExecutiveDiscoveryAnalysis(
  analysis: ExecutiveDiscoveryAnalysis | null | undefined,
): analysis is ExecutiveDiscoveryAnalysis {
  if (!analysis) {
    return false;
  }

  return (
    analysis.firstImpression.trim().length > 0 &&
    analysis.reason.trim().length > 0 &&
    analysis.caveat.trim().length > 0 &&
    analysis.expectedOutcome.trim().length > 0 &&
    analysis.focusItems.length === 3 &&
    analysis.focusItems.every((item) => item.trim().length > 0)
  );
}

function OnboardingWelcomeScreen({
  displayName,
  onStart,
}: {
  displayName: string;
  onStart: () => void;
}) {
  return (
    <OnboardingPhoneShell>
      <div className="flex min-h-full flex-col px-9 pb-7 pt-5 text-[#101833]">
        <PhoneStatusBar rightContent={<SkipButton />} />

        <section className="flex flex-col items-center pt-11 text-center">
          <div className="relative grid h-[168px] w-[168px] place-items-center rounded-full bg-indigo-50/60 shadow-[0_0_90px_rgba(79,70,229,0.18)]">
            <div className="absolute inset-5 rounded-full bg-indigo-100/45" />
            <AiAvatar size="large" />
          </div>

          <h1 className="mt-10 text-[30px] font-black leading-none tracking-normal text-[#07132f]">
            Merhaba{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-[#6d63ff] bg-clip-text text-transparent">
              {displayName}
            </span>{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-5 text-[17px] font-extrabold leading-tight text-indigo-600">
            Ben senin AI Genel Müdürünüm.
          </p>
          <p className="mt-7 max-w-[330px] text-center text-[16px] font-medium leading-[1.72] text-[#17213d]">
            Sana cevap vermek için değil,
            <br />
            seni tanımak, unutmaman gerekenleri
            <br />
            hatırlatmak ve hedeflerine ulaşmana
            <br />
            yardımcı olmak için buradayım.
          </p>
        </section>

        <section className="mt-8 space-y-5">
          <WelcomeCapability
            icon={<IconTarget className="h-8 w-8" />}
            iconTone="bg-indigo-100/70 text-indigo-600"
            subtitle="Doğru şeylere odaklanmanı sağlarım."
            title="Önceliklerini belirlerim"
          />
          <WelcomeCapability
            icon={<IconBell className="h-8 w-8" />}
            iconTone="bg-teal-100/70 text-teal-600"
            subtitle="Hiçbir önemli şeyi kaçırma."
            title="Takiplerini yönetirim"
          />
          <WelcomeCapability
            icon={<IconChartBars className="h-8 w-8" />}
            iconTone="bg-orange-100/70 text-orange-500"
            subtitle="Hedeflerine adım adım yaklaştırırım."
            title="İlerlemelerini izlerim"
          />
          <WelcomeCapability
            icon={<IconShield className="h-8 w-8" />}
            iconTone="bg-sky-100/70 text-blue-600"
            subtitle="Seni hep bir adım önde tutarım."
            title="Riskleri ve fırsatları görürüm"
          />
        </section>

        <section className="mt-8 flex min-h-[74px] items-center gap-5 rounded-[18px] border border-slate-200/90 bg-white/86 px-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-indigo-50 text-slate-600">
            <IconClock className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[15px] font-black text-[#101833]">
              Seni tanımam yaklaşık 5 dakika sürecek.
            </p>
            <p className="mt-1 text-[14px] font-medium text-slate-500">
              Hazır olduğunda başlayalım.
            </p>
          </div>
        </section>

        <button
          className="mt-8 flex min-h-[58px] w-full items-center justify-center gap-4 rounded-[16px] bg-[#5236f5] text-[18px] font-black text-white shadow-[0_18px_40px_rgba(82,54,245,0.27)]"
          onClick={onStart}
          type="button"
        >
          Başlayalım
          <IconArrowRight className="h-7 w-7" />
        </button>

        <div className="mt-5 flex items-center justify-center gap-3 text-[13px] font-semibold text-slate-500">
          <IconLock className="h-4 w-4" />
          Verilerin tamamen güvende ve sadece senin kontrolünde.
        </div>
        <PageDots activeIndex={0} count={4} />
      </div>
    </OnboardingPhoneShell>
  );
}

function RecognitionChatScreen({
  answers,
  errorMessage,
  isSubmitting,
  onAnswerChange,
  onBack,
  onComplete,
  onSaveProgress,
  stepIndex,
}: {
  answers: RecognitionAnswers;
  displayName: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onAnswerChange: (key: RecognitionQuestionKey, value: string) => void;
  onBack: () => void;
  onComplete: () => void;
  onSaveProgress: (nextStep: number) => void;
  stepIndex: number;
}) {
  const question = recognitionQuestions[stepIndex];
  const currentAnswer = answers[question.key];
  const answeredQuestions = recognitionQuestions.slice(0, stepIndex);
  const completion = Math.round(((stepIndex + 1) / recognitionQuestions.length) * 18);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const messageList = messageListRef.current;

    if (!messageList) {
      return;
    }

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth",
    });
  }, [stepIndex]);

  function submitCurrentAnswer() {
    if (!currentAnswer.trim() || isSubmitting) {
      return;
    }

    if (stepIndex === recognitionQuestions.length - 1) {
      onComplete();
      return;
    }

    onSaveProgress(stepIndex + 1);
  }

  return (
    <OnboardingPhoneShell variant="recognition">
      <div className="flex h-full min-h-0 flex-col px-5 pb-5 pt-5 text-[#101833] sm:px-7">
        <PhoneStatusBar />
        <OnboardingTopBar
          onBack={stepIndex > 0 ? onBack : undefined}
          status="Çevrimiçi"
        />
        <ProgressSegments
          current={stepIndex + 1}
          label={`${stepIndex + 1} / ${recognitionQuestions.length} soru`}
          total={recognitionQuestions.length}
        />

        <RecognitionCompactMap completion={completion} stepIndex={stepIndex} />

        <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden md:mt-6 md:grid-cols-[minmax(0,1fr)_168px]">
          <div
            className="min-h-0 overflow-y-auto overscroll-contain pr-1 md:pr-0"
            ref={messageListRef}
          >
            <div className="space-y-6 pb-3">
              {answeredQuestions.map((answeredQuestion) => (
                <div key={answeredQuestion.key}>
                  <AssistantQuestionCard question={answeredQuestion} />
                  <UserAnswerBubble answer={answers[answeredQuestion.key]} />
                </div>
              ))}

              <AssistantQuestionCard question={question} />
              <ErrorMessage message={errorMessage} />
            </div>
          </div>

          <RecognitionSideMap completion={completion} stepIndex={stepIndex} />
        </div>

        <div className="sticky bottom-0 mt-5 flex min-h-[64px] items-center gap-3 rounded-full bg-white px-4 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
          <textarea
            className="min-h-8 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] font-semibold leading-5 text-[#101833] outline-none placeholder:text-slate-400"
            onChange={(event) =>
              onAnswerChange(question.key, event.target.value)
            }
            placeholder="Mesaj yaz..."
            rows={1}
            value={currentAnswer}
          />
          <button
            aria-label="Mikrofon"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600"
            type="button"
          >
            <IconMic className="h-6 w-6" />
          </button>
          <button
            aria-label="Gönder"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#5738f5] text-white shadow-[0_12px_28px_rgba(87,56,245,0.25)] disabled:opacity-45"
            disabled={!currentAnswer.trim() || isSubmitting}
            onClick={submitCurrentAnswer}
            type="button"
          >
            <IconArrowRight className="h-7 w-7" />
          </button>
        </div>
      </div>
    </OnboardingPhoneShell>
  );
}

function ActivationScreen({
  assessment,
  discoveryAnalysis,
  displayName,
  onEnter,
  recognitionProfile,
}: {
  answers: OnboardingAnswers;
  assessment: OnboardingExecutiveAssessment | null;
  discoveryAnalysis: ExecutiveDiscoveryAnalysis | null;
  displayName: string;
  onEnter: () => void;
  recognitionProfile: RecognitionProfile | null | undefined;
}) {
  const riskSignals = assessment?.riskSignals ?? [];
  const firstDecision = assessment?.firstExecutiveDecision ?? null;

  const focusItems =
    discoveryAnalysis?.focusItems.filter((item) => item.trim().length > 0) ??
    recognitionProfile?.insight?.sevenDayPlan?.map((p) => p.action) ??
    [];

  const expectedOutcome =
    discoveryAnalysis?.expectedOutcome ??
    recognitionProfile?.insight?.recommendedFirstModule ??
    null;

  const firstImpression =
    discoveryAnalysis?.firstImpression ?? recognitionProfile?.summary ?? null;

  return (
    <OnboardingPhoneShell>
      <div className="flex min-h-full flex-col px-8 pb-7 pt-5 text-[#101833]">
        <PhoneStatusBar />
        <OnboardingTopBar status="Tamamlandı" />
        <ProgressSegments
          current={recognitionQuestions.length}
          label={`${recognitionQuestions.length} / ${recognitionQuestions.length} tamamlandı`}
          total={recognitionQuestions.length}
        />

        <section className="mt-8 flex items-center gap-6">
          <AiAvatar size="medium" />
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-normal text-[#07132f]">
              Harika{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-[#6d63ff] bg-clip-text text-transparent">
                {displayName}!
              </span>
            </h1>
            <p className="mt-3 text-[15px] font-semibold leading-6 text-slate-500">
              İlk değerlendirmemi tamamladım.
            </p>
          </div>
        </section>

        {firstImpression ? (
          <section className="mt-7">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">
              İlk Değerlendirmem
            </p>
            <div className="rounded-[20px] bg-indigo-50/60 px-5 py-5 shadow-[0_12px_32px_rgba(82,54,245,0.08)]">
              <p className="text-[17px] font-black leading-7 text-[#07132f]">
                {firstImpression}
              </p>
              {discoveryAnalysis?.reason ? (
                <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600">
                  {discoveryAnalysis.reason}
                </p>
              ) : null}
              {discoveryAnalysis?.caveat ? (
                <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3">
                  <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-[13px] font-semibold leading-5 text-amber-800">
                    {discoveryAnalysis.caveat}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {firstDecision ? (
          <section className="mt-6">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">
              İlk Yönetim Kararım
            </p>
            <div className="rounded-[20px] bg-white px-5 py-5 shadow-[0_16px_42px_rgba(15,23,42,0.08)]">
              {firstDecision.isFallback ? (
                <p className="mb-3 rounded-[10px] bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-4 text-slate-500">
                  Henüz yeterli bağlam olmadığı için genel bir karar ürettim.
                </p>
              ) : null}
              <p className="text-[18px] font-black leading-7 text-[#07132f]">
                {firstDecision.title}
              </p>
              <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600">
                {firstDecision.rationale}
              </p>
              <div className="mt-4 flex items-start gap-3 rounded-[14px] bg-indigo-600 px-4 py-3">
                <IconBolt className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                <p className="text-[13px] font-bold leading-5 text-white">
                  {firstDecision.firstAction}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {focusItems.length > 0 ? (
          <section className="mt-6">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">
              İlk 30 Gün Odağı
            </p>
            <div className="rounded-[20px] bg-white px-5 py-5 shadow-[0_16px_42px_rgba(15,23,42,0.08)]">
              <div className="space-y-3">
                {focusItems.slice(0, 3).map((item, index) => (
                  <div
                    className="flex items-start gap-3"
                    key={index}
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                    <p className="text-[15px] font-bold leading-6 text-[#07132f]">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
              {expectedOutcome ? (
                <div className="mt-4 rounded-[14px] bg-indigo-50/70 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-indigo-600">
                    Beklenen Kazanım
                  </p>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[#07132f]">
                    {expectedOutcome}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {riskSignals.length > 0 ? (
          <section className="mt-6">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">
              Dikkat Etmemiz Gerekenler
            </p>
            <div className="rounded-[20px] bg-white px-5 py-5 shadow-[0_16px_42px_rgba(15,23,42,0.08)]">
              <div className="space-y-3">
                {riskSignals.slice(0, 3).map((signal) => (
                  <div
                    className="flex items-start gap-3 rounded-[14px] border border-red-100 bg-red-50 px-4 py-3"
                    key={signal.key}
                  >
                    <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-[13px] font-semibold leading-5 text-red-800">
                      {signal.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <button
          className="mt-8 flex min-h-[58px] w-full items-center justify-center gap-5 rounded-[16px] bg-[#5236f5] text-[18px] font-black text-white shadow-[0_18px_40px_rgba(82,54,245,0.27)]"
          onClick={onEnter}
          type="button"
        >
          Metrix&apos;i Kullanmaya Başla
          <IconArrowRight className="h-7 w-7" />
        </button>

        <div className="mt-5 flex items-center justify-center gap-3 text-[13px] font-semibold text-slate-500">
          <IconLock className="h-4 w-4" />
          Verilerin güvende. Kontrol her zaman sende.
        </div>
      </div>
    </OnboardingPhoneShell>
  );
}

function OnboardingPhoneShell({
  children,
  variant = "phone",
}: {
  children: React.ReactNode;
  variant?: "phone" | "recognition";
}) {
  const maxWidth = variant === "recognition" ? "max-w-[860px]" : "max-w-[430px]";
  const innerOverflow =
    variant === "recognition"
      ? "overflow-hidden"
      : "overflow-y-auto overscroll-contain";

  return (
    <main className="min-h-[100dvh] bg-[#f3f5fb] px-0 py-0 text-[#101833] sm:px-4 sm:py-4 lg:bg-[#eef2f8]">
      <div
        className={`mx-auto h-[100dvh] max-h-[932px] w-full ${maxWidth} overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(91,70,245,0.09),transparent_27%),linear-gradient(180deg,#ffffff_0%,#fbfcff_62%,#ffffff_100%)] shadow-[0_24px_90px_rgba(15,23,42,0.16)] ring-1 ring-white/80 sm:rounded-[42px]`}
      >
        <div className={`h-full ${innerOverflow}`}>{children}</div>
      </div>
    </main>
  );
}

function PhoneStatusBar({ rightContent }: { rightContent?: React.ReactNode }) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between text-[15px] font-black text-black">
      <span>9:41</span>
      {rightContent ? (
        rightContent
      ) : (
        <div className="flex items-center gap-2">
          <IconSignal />
          <IconWifi />
          <IconBattery />
        </div>
      )}
    </header>
  );
}

function SkipButton() {
  return (
    <button
      className="h-12 rounded-[14px] border border-slate-200 bg-white/82 px-5 text-[16px] font-black text-indigo-600 shadow-[0_8px_22px_rgba(15,23,42,0.04)]"
      type="button"
    >
      Atla
    </button>
  );
}

function OnboardingTopBar({
  onBack,
  status,
}: {
  onBack?: () => void;
  status: string;
}) {
  return (
    <div className="mt-7 grid grid-cols-[56px_1fr_56px] items-center">
      <button
        aria-label="Geri"
        className="grid h-14 w-14 place-items-center rounded-full bg-white text-[#101833] shadow-[0_14px_34px_rgba(15,23,42,0.08)] disabled:opacity-0"
        disabled={!onBack}
        onClick={onBack}
        type="button"
      >
        <IconBack className="h-7 w-7" />
      </button>
      <div className="text-center">
        <h1 className="text-[19px] font-black tracking-normal text-[#101833]">
          AI Genel Müdür
        </h1>
        <p className="mt-1 flex items-center justify-center gap-2 text-[15px] font-bold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          {status}
        </p>
      </div>
      <button
        aria-label="Daha fazla"
        className="grid h-14 w-14 place-items-center rounded-full bg-white text-[26px] font-black leading-none text-[#101833] shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
        type="button"
      >
        ...
      </button>
    </div>
  );
}

function ProgressSegments({
  current,
  label,
  total,
}: {
  current: number;
  label: string;
  total: number;
}) {
  return (
    <div className="mt-7">
      <div className="mx-auto grid max-w-[280px] grid-cols-7 gap-2">
        {Array.from({ length: total }).map((_, index) => (
          <span
            className={`h-1.5 rounded-full ${
              index < current ? "bg-[#5a3df5]" : "bg-slate-200"
            }`}
            key={index}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[13px] font-black text-indigo-600">
        {label}
      </p>
    </div>
  );
}

function AiAvatar({ size }: { size: "small" | "medium" | "large" }) {
  const sizes = {
    small: "h-9 w-9 rounded-[12px]",
    medium: "h-[104px] w-[104px] rounded-[32px]",
    large: "h-[108px] w-[108px] rounded-[34px]",
  };
  const faceSizes = {
    small: "h-5 w-7 rounded-[8px]",
    medium: "h-12 w-[70px] rounded-[18px]",
    large: "h-[48px] w-[72px] rounded-[18px]",
  };

  return (
    <div
      className={`relative grid place-items-center bg-gradient-to-br from-white via-indigo-100 to-sky-100 shadow-[0_22px_44px_rgba(82,54,245,0.22)] ${sizes[size]}`}
    >
      <span className="absolute -left-1 top-1/2 h-9 w-4 -translate-y-1/2 rounded-l-full bg-indigo-200" />
      <span className="absolute -right-1 top-1/2 h-9 w-4 -translate-y-1/2 rounded-r-full bg-indigo-200" />
      <div
        className={`grid place-items-center bg-[#10133b] shadow-inner ${faceSizes[size]}`}
      >
        <div className="flex items-center gap-2 text-sky-300">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
          <span className="h-2 w-5 rounded-b-full border-b-[3px] border-sky-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
        </div>
      </div>
    </div>
  );
}

function WelcomeCapability({
  icon,
  iconTone,
  subtitle,
  title,
}: {
  icon: React.ReactNode;
  iconTone: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-5">
      <div className={`grid h-16 w-16 place-items-center rounded-[18px] ${iconTone}`}>
        {icon}
      </div>
      <div>
        <p className="text-[16px] font-black text-[#101833]">{title}</p>
        <p className="mt-1 text-[14px] font-medium text-slate-500">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function PageDots({ activeIndex, count }: { activeIndex: number; count: number }) {
  return (
    <div className="mt-5 flex justify-center gap-5">
      {Array.from({ length: count }).map((_, index) => (
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            index === activeIndex ? "bg-[#5a3df5]" : "bg-slate-200"
          }`}
          key={index}
        />
      ))}
    </div>
  );
}

function AssistantQuestionCard({
  question,
}: {
  question: (typeof recognitionQuestions)[number];
}) {
  return (
    <div className="relative pl-11">
      <div className="absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-[13px] bg-indigo-100/70">
        <AiAvatar size="small" />
      </div>
      <div className="rounded-[18px] bg-white px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
        <h2 className="text-[17px] font-black leading-7 tracking-normal text-[#101833]">
          {question.title}
        </h2>
        <p className="mt-5 text-[12px] font-semibold leading-5 text-slate-400">
          Örnekler: {question.chips.slice(0, 6).join(", ")}
        </p>
        <p className="mt-2 text-[12px] font-medium leading-5 text-slate-400">
          {question.helper}
        </p>
      </div>
    </div>
  );
}

function UserAnswerBubble({ answer }: { answer: string }) {
  if (!answer.trim()) {
    return null;
  }

  return (
    <div className="ml-16 mt-4 rounded-[18px] bg-indigo-100/70 px-5 py-4 text-[16px] font-bold leading-7 text-[#101833]">
      {answer}
      <div className="mt-1 text-right text-xs font-bold text-slate-500">
        09:42 <span className="text-indigo-600">✓✓</span>
      </div>
    </div>
  );
}

function RecognitionSideMap({
  completion,
  stepIndex,
}: {
  completion: number;
  stepIndex: number;
}) {
  const items = buildRecognitionMapItems(stepIndex);

  return (
    <aside className="sticky top-4 hidden self-start rounded-[18px] bg-white px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-100 md:block">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase text-slate-500">
          Tanıma Haritası
        </p>
        <span className="text-xs font-black text-slate-400">i</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${item.tone}`}>
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black leading-3 text-[#101833]">
                  {item.label}
                </p>
                <p className="text-right text-[12px] font-black text-[#101833]">
                  %{item.value}
                </p>
              </div>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#5a3df5]"
                style={{ width: `${item.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 text-center">
        <p className="text-[11px] font-bold text-slate-500">Tanıma Oranı</p>
        <p className="mt-1 text-[20px] font-black text-[#5a3df5]">
          %{completion}
        </p>
      </div>
    </aside>
  );
}

function buildRecognitionMapItems(stepIndex: number) {
  return [
    { label: "Kişisel Hedefler", icon: <IconUser className="h-4 w-4" />, tone: "bg-indigo-100 text-indigo-600", value: stepIndex >= 1 ? 18 : 12 },
    { label: "İş Hayatı", icon: <IconTarget className="h-4 w-4" />, tone: "bg-teal-100 text-teal-600", value: stepIndex >= 2 ? 14 : 8 },
    { label: "Şirket", icon: <IconBuilding className="h-4 w-4" />, tone: "bg-sky-100 text-blue-600", value: stepIndex >= 3 ? 12 : 5 },
    { label: "Finans", icon: <IconUsers className="h-4 w-4" />, tone: "bg-orange-100 text-orange-500", value: stepIndex >= 4 ? 9 : 3 },
    { label: "İlişkiler", icon: <IconWave className="h-4 w-4" />, tone: "bg-cyan-100 text-cyan-600", value: stepIndex >= 5 ? 7 : 2 },
    { label: "Alışkanlıklar", icon: <IconBell className="h-4 w-4" />, tone: "bg-violet-100 text-violet-600", value: stepIndex >= 6 ? 6 : 2 },
  ];
}

function RecognitionCompactMap({
  completion,
  stepIndex,
}: {
  completion: number;
  stepIndex: number;
}) {
  const items = buildRecognitionMapItems(stepIndex);

  return (
    <section className="mt-5 rounded-[18px] bg-white/90 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.07)] ring-1 ring-slate-100 md:hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase text-slate-500">
            Tanıma Haritası
          </p>
          <p className="mt-1 text-[12px] font-bold text-slate-400">
            6 alanı birlikte tanıyorum
          </p>
        </div>
        <p className="text-[20px] font-black text-[#5a3df5]">%{completion}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {items.map((item) => (
          <div className="min-w-0" key={item.label}>
            <div className="flex items-center gap-1.5">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[8px] ${item.tone}`}>
                {item.icon}
              </span>
              <p className="min-w-0 flex-1 truncate text-[10px] font-black text-[#101833]">
                {item.label}
              </p>
              <p className="text-[10px] font-black text-[#101833]">
                %{item.value}
              </p>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#5a3df5]"
                style={{ width: `${item.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


function MobileCommandCenter({
  actionEngineResult,
  canReviewMemoryCandidates,
  guidedActionResult,
  recognitionMapResult,
  recognitionInsight,
}: {
  actionEngineResult: ActionEngineResult | null;
  canReviewMemoryCandidates: boolean;
  guidedActionResult: GuidedActionResult | null;
  recognitionMapResult: RecognitionMapResult | null;
  recognitionInsight: RecognitionInsight | null;
}) {
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const topAction = actionEngineResult?.topAction;
  const topActionExplanation = guidedActionResult?.topActionExplanation;
  const recommendedActions = actionEngineResult?.recommendedActions ?? [];
  const recognitionStartSegments = 1;
  const focusTitle =
    topAction?.title ?? recognitionInsight?.recommendedFirstModule ?? "İlk Odak";
  const focusReason =
    topAction?.reason ??
    recognitionInsight?.mainBottleneck ??
    "Bugün önceliğin bu. Bu adımı tamamlarsan sistem seni daha iyi yönlendirebilir.";
  const managerExplanation =
    topActionExplanation?.summary ??
    topActionExplanation?.whyNow ??
    `${focusReason} Bugün önceliğin bu.`;
  const whyNow = topActionExplanation?.whyNow ?? focusReason;

  function handleMockAction(label: string) {
    window.alert(`${label} yakında aktif olacak.`);
  }

  if (isAiChatOpen) {
    return (
      <main className="min-h-[100dvh] bg-[#e8ddd0] px-3 py-5 sm:px-6 lg:bg-[#d8cfc4]">
        <div className="mx-auto flex h-[calc(100dvh-40px)] max-h-[calc(100dvh-40px)] max-w-[430px] flex-col overflow-hidden rounded-[34px] bg-[#faf8f3] shadow-[0_24px_80px_rgba(7,18,38,0.20)] ring-1 ring-[#ece5d8] lg:my-6">
          <MetrixChatTab apiPost={apiPost} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7f7f9] px-3 py-5 text-[#111827] sm:px-6 lg:bg-[#eceef5]">
      <div className="mx-auto flex h-[calc(100dvh-40px)] max-h-[calc(100dvh-40px)] max-w-[430px] flex-col overflow-hidden rounded-[34px] bg-[#fbfbfc] shadow-[0_24px_80px_rgba(15,23,42,0.18)] ring-1 ring-black/5 lg:my-6">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-20 pt-6 sm:px-7">
          <header className="mb-5">
            <div className="mb-6 flex items-center justify-between text-sm font-semibold text-black">
              <span>9:41</span>
              <div className="flex items-center gap-2">
                <IconSignal />
                <IconWifi />
                <IconBattery />
              </div>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[29px] font-bold leading-tight tracking-normal text-slate-950">
                  Günaydın, Murat ☀️
                </h1>
                <p className="mt-1.5 text-[16px] leading-6 text-slate-500">
                  Seni tanımaya başlıyorum
                </p>
              </div>
              <button
                aria-label="Bildirimler"
                className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white shadow-[0_18px_42px_rgba(15,23,42,0.08)]"
                onClick={() => handleMockAction("Bildirimler")}
              >
                <IconBell className="h-6 w-6 text-slate-900" />
                <span className="absolute right-2.5 top-2 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-white" />
              </button>
            </div>
            <div className="mt-5 rounded-[18px] bg-white px-4 py-3 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-indigo-600">
                    Tanıma Başlıyor
                  </p>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-500">
                    İlk sinyaller alındı.
                    <br />
                    Henüz yeterli bağlamım yok.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600">
                  Hafıza onaylandıkça netleşir
                </span>
              </div>
              <div className="mt-3 grid grid-cols-10 gap-1.5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <span
                    className={`h-2 rounded-full ${
                      index < recognitionStartSegments
                        ? "bg-indigo-600"
                        : "bg-slate-200"
                    }`}
                    key={index}
                  />
                ))}
              </div>
            </div>
          </header>

          <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-indigo-500 via-[#7077f3] to-[#8d94ff] p-5 text-white shadow-[0_22px_48px_rgba(79,70,229,0.28)]">
            <div className="absolute right-4 top-4 grid h-24 w-24 place-items-center rounded-full bg-white/10">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-white/20">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-white">
                  <IconTarget className="h-8 w-8 text-indigo-600" />
                </div>
              </div>
            </div>
            <div className="absolute bottom-5 right-6 h-20 w-20 opacity-20 [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:12px_12px]" />
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-white/90">
              BUGÜNKÜ ODAK
            </p>
            <h2 className="mt-6 max-w-[245px] text-[28px] font-bold leading-tight tracking-normal">
              {focusTitle}
            </h2>
            <p className="mt-3 max-w-[265px] text-[16px] leading-6 text-white/90">
              {shortenText(focusReason, 64)}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                className="flex h-12 min-w-40 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-indigo-600 shadow-[0_12px_28px_rgba(255,255,255,0.22)]"
                onClick={() => handleMockAction("Hemen Başla")}
              >
                <IconPlay className="h-5 w-5" />
                Hemen Başla
              </button>
              <button
                aria-label="Daha fazla"
                className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-xl font-bold text-white backdrop-blur"
                onClick={() => handleMockAction("Daha fazla")}
              >
                ...
              </button>
            </div>
          </section>

          <button
            className="mt-4 flex w-full items-center justify-between rounded-[22px] bg-white p-4 text-left shadow-[0_18px_48px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.12)]"
            onClick={() => setIsAiChatOpen(true)}
            type="button"
          >
            <div className="max-w-[220px]">
              <p className="text-sm font-bold uppercase tracking-[0.08em] text-teal-600">
                AI GENEL MÜDÜR
              </p>
              <p className="mt-3 text-[16px] font-medium leading-6 text-slate-950">
                {shortenText(managerExplanation, 84)}
              </p>
            </div>
            <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-300 via-violet-200 to-teal-400 shadow-[0_18px_40px_rgba(20,184,166,0.25)]">
              <div className="absolute inset-0 rounded-full bg-white/10 blur-sm" />
              <div className="h-6 w-9 rounded-b-full border-b-4 border-white" />
            </div>
          </button>

          <section className="mt-4 rounded-[18px] bg-white px-5 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                <IconTarget className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  NEDEN BU?
                </p>
                <p className="mt-2 text-[14px] font-medium leading-5 text-slate-700">
                  {shortenText(whyNow, 132)}
                </p>
              </div>
            </div>
          </section>

          <RecognitionMapCard
            apiGet={apiGet}
            apiPatch={apiPatch}
            recognitionMapResult={recognitionMapResult}
          />

          <MemorySuggestionsPanel
            apiGet={apiGet}
            apiPost={apiPost}
            canReviewMemoryCandidates={canReviewMemoryCandidates}
          />

          <section className="mt-8">
            <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-slate-500">
              HIZLI AKSİYONLAR
            </h3>
            <div className="mt-4 grid grid-cols-4 gap-3">
              <QuickAction
                color="text-indigo-600"
                icon={<IconCalendar className="h-8 w-8" />}
                label="Bugünümü Planla"
                onClick={() => handleMockAction("Bugünümü Planla")}
              />
              <QuickAction
                color="text-teal-600"
                icon={<IconUsers className="h-8 w-8" />}
                label="Takipleri Göster"
                onClick={() => handleMockAction("Takipleri Göster")}
              />
              <QuickAction
                color="text-orange-500"
                icon={<IconAlert className="h-8 w-8" />}
                label="Riskleri Göster"
                onClick={() => handleMockAction("Riskleri Göster")}
              />
              <QuickAction
                color="text-fuchsia-600"
                icon={<IconBulb className="h-8 w-8" />}
                label="Haftalık Özet Çıkar"
                onClick={() => handleMockAction("Haftalık Özet Çıkar")}
              />
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-slate-500">
                ÖNERİLEN AKSİYONLAR
              </h3>
              <button className="flex items-center gap-1 text-sm font-bold text-indigo-600">
                Tümü <span className="text-xl leading-none">›</span>
              </button>
            </div>
            <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              {recommendedActions.slice(0, 3).map((action, index) => (
                <RecommendedActionRow
                  action={action}
                  index={index}
                  key={action.id}
                />
              ))}
            </div>
          </section>
        </div>
        <div className="shrink-0">
          <BottomNavigation />
        </div>
      </div>
    </main>
  );
}

function LoginLandingScreen({
  authStep,
  devOtpCode,
  email,
  errorMessage,
  isSubmitting,
  onChangeEmail,
  onEmailChange,
  onRequestOtp,
  onVerifyOtp,
  onRememberMeChange,
  onResendOtp,
  rememberMe,
  resendSecondsLeft,
}: {
  authStep: LoginAuthStep;
  devOtpCode: string | null;
  email: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onChangeEmail: () => void;
  onEmailChange: (value: string) => void;
  onRequestOtp: () => void;
  onVerifyOtp: (code: string) => void;
  onRememberMeChange: (value: boolean) => void;
  onResendOtp: () => void;
  rememberMe: boolean;
  resendSecondsLeft: number;
}) {
  const [otpCode, setOtpCode] = useState("");
  const canRequestOtp = email.trim().length > 3 && !isSubmitting;
  const canResendOtp = resendSecondsLeft === 0 && !isSubmitting;

  useEffect(() => {
    if (authStep === "form") setOtpCode("");
  }, [authStep]);

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#071226] px-5 py-5 text-[#14213d]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_35%_6%,rgba(255,248,232,0.96)_0%,rgba(235,205,164,0.72)_34%,rgba(180,122,60,0.2)_56%,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-[18%] -left-[30%] h-[43%] w-[118%] rotate-[7deg] rounded-[100%] bg-[#071226] shadow-[0_-24px_70px_rgba(7,18,38,0.18)]"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-[14%] left-[28%] h-[37%] w-[98%] -rotate-[9deg] rounded-[100%] bg-[radial-gradient(circle_at_45%_42%,rgba(244,184,105,0.86)_0%,rgba(180,122,60,0.72)_48%,rgba(138,90,43,0.2)_72%,transparent_100%)] opacity-95"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-[20%] left-[36%] h-[44%] w-[110%] -rotate-[9deg] rounded-[100%] border-t border-[#f0c283]/35"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-40px)] w-full max-w-[390px] flex-col justify-center">
        <div className="rounded-[38px] border border-white/80 bg-[#fffaf2]/96 px-5 py-8 shadow-[0_34px_90px_rgba(0,0,0,0.38),0_18px_44px_rgba(180,122,60,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]">
          <header className="text-center">
            <MetrixLogoMark />
            <p className="mx-auto mt-4 inline-flex h-8 items-center rounded-full border border-[#d9a873] bg-[#fff4e3] px-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#8a5a2b] shadow-[0_10px_22px_rgba(138,90,43,0.12)]">
              AI Genel Müdür
            </p>
          </header>

          <section className="mt-8 text-center">
            <h1 className="text-[34px] font-black leading-[1.05] tracking-normal text-[#071226]">
              Başlayalım.
            </h1>
            <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#b47a3c]" />
          </section>

          <section className="mt-9 rounded-[28px] border border-[#ead7bf] bg-[#fffdf8]/96 px-4 py-5 shadow-[0_22px_52px_rgba(7,18,38,0.13),0_10px_28px_rgba(180,122,60,0.1),inset_0_1px_0_rgba(255,255,255,0.75)]">
            {authStep === "form" ? (
              <>
                <div>
                  <label className="text-[14px] font-extrabold text-[#071226]">
                    E-posta adresiniz
                  </label>
                  <div className="mt-3 flex h-[58px] items-center rounded-[18px] border border-[#d9ad7a] bg-[#fffaf2] px-4 transition focus-within:border-[#a66d35] focus-within:shadow-[0_0_0_4px_rgba(166,109,53,0.13)]">
                    <input
                      autoComplete="email"
                      className="min-w-0 flex-1 bg-transparent text-[17px] font-bold tracking-normal text-[#071226] outline-none placeholder:text-[#a99a89]"
                      inputMode="email"
                      onChange={(event) => onEmailChange(event.target.value)}
                      placeholder="siz@firma.com"
                      type="email"
                      value={email}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <LoginCheckbox
                    checked={rememberMe}
                    label="Beni hatırla"
                    onChange={onRememberMeChange}
                  />
                </div>

                <button
                  className="mt-6 flex h-[56px] w-full items-center justify-center gap-4 rounded-[18px] bg-[#071226] text-[17px] font-extrabold text-white shadow-[0_22px_40px_rgba(7,18,38,0.38),0_8px_20px_rgba(180,122,60,0.18)] transition hover:bg-[#0b1730] disabled:cursor-not-allowed disabled:bg-[#8f877c] disabled:shadow-none"
                  disabled={!canRequestOtp}
                  onClick={onRequestOtp}
                  type="button"
                >
                  {isSubmitting ? "Bekleyin..." : "Devam Et"}
                  <IconArrowRight className="h-6 w-6" />
                </button>
              </>
            ) : null}

            {authStep === "otp" ? (
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] border border-[#d9ad7a] bg-[#fff4e3] text-[#8a5a2b] shadow-[0_14px_30px_rgba(138,90,43,0.12)]">
                  <IconLock className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-[25px] font-black leading-tight tracking-normal text-[#071226]">
                  Kodu girin.
                </h2>
                <p className="mx-auto mt-3 max-w-[270px] text-[15px] font-semibold leading-6 text-[#6f6256]">
                  <span className="font-extrabold text-[#071226]">{email}</span> adresine 6 haneli kod gönderdim.
                </p>
                {devOtpCode ? (
                  <p className="mx-auto mt-3 max-w-[270px] rounded-[12px] border border-[#d9ad7a] bg-[#fff4e3] px-3 py-2 text-[13px] font-bold text-[#8a5a2b]">
                    Geliştirme kodu: {devOtpCode}
                  </p>
                ) : null}
                <div className="mt-5">
                  <input
                    autoComplete="one-time-code"
                    className="h-[58px] w-full rounded-[18px] border border-[#d9ad7a] bg-[#fffaf2] px-4 text-center text-[26px] font-black tracking-[0.35em] text-[#071226] outline-none transition focus:border-[#a66d35] focus:shadow-[0_0_0_4px_rgba(166,109,53,0.13)] disabled:opacity-50"
                    disabled={isSubmitting}
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="• • • • • •"
                    value={otpCode}
                  />
                </div>
                <div className="mt-4 grid gap-3">
                  <button
                    className="h-[56px] rounded-[18px] bg-[#071226] text-[17px] font-extrabold text-white shadow-[0_22px_40px_rgba(7,18,38,0.38)] transition disabled:cursor-not-allowed disabled:bg-[#8f877c] disabled:shadow-none"
                    disabled={otpCode.length < 6 || isSubmitting}
                    onClick={() => onVerifyOtp(otpCode)}
                    type="button"
                  >
                    {isSubmitting ? "Doğrulanıyor..." : "Giriş Yap"}
                  </button>
                  <button
                    className="h-12 rounded-[16px] border border-[#d9ad7a] bg-[#fffaf2] text-[15px] font-extrabold text-[#8a5a2b] transition hover:border-[#a66d35] hover:text-[#071226]"
                    onClick={onChangeEmail}
                    type="button"
                  >
                    E-postayı değiştir
                  </button>
                  <button
                    className="h-12 rounded-[16px] border border-[#d9ad7a] bg-transparent text-[15px] font-extrabold text-[#8a5a2b] transition disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canResendOtp}
                    onClick={onResendOtp}
                    type="button"
                  >
                    {isSubmitting
                      ? "Gönderiliyor..."
                      : resendSecondsLeft > 0
                        ? `${resendSecondsLeft} sn sonra tekrar gönder`
                        : "Tekrar gönder"}
                  </button>
                </div>
              </div>
            ) : null}

            <ErrorMessage message={errorMessage} />

            {authStep === "form" ? (
              <p className="mt-5 text-center text-[11px] font-semibold leading-[1.55] text-[#827568]">
                Devam ederek{" "}
                <Link
                  className="font-bold text-[#8a5a2b] underline decoration-[#b47a3c] underline-offset-3 transition hover:text-[#14213d]"
                  href="/kvkk"
                >
                  KVKK Aydınlatma Metni
                </Link>{" "}
                ve{" "}
                <Link
                  className="font-bold text-[#8a5a2b] underline decoration-[#b47a3c] underline-offset-3 transition hover:text-[#14213d]"
                  href="/kullanim-sartlari"
                >
                  Kullanım Şartları
                </Link>
                ’nı kabul etmiş olursunuz.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function RecognitionMapCard({
  apiGet,
  apiPatch,
  recognitionMapResult,
}: {
  apiGet: <T>(path: string) => Promise<ApiResponse<T>>;
  apiPatch: <T = unknown>(
    path: string,
    body: Record<string, unknown>,
  ) => Promise<ApiResponse<T>>;
  recognitionMapResult: RecognitionMapResult | null;
}) {
  const [memoryItems, setMemoryItems] = useState<MemoryItemCard[]>([]);
  const [selectedMemoryItem, setSelectedMemoryItem] =
    useState<MemoryItemCard | null>(null);
  const [editedMemoryValue, setEditedMemoryValue] = useState("");
  const [memoryErrorMessage, setMemoryErrorMessage] = useState<string | null>(
    null,
  );
  const [isMemorySaving, setIsMemorySaving] = useState(false);

  useEffect(() => {
    void refreshActiveMemoryItems();
  }, []);

  if (!recognitionMapResult) {
    return null;
  }

  const businessType =
    findMapValue(recognitionMapResult.inferredAboutBusiness, "Isletme tipi") ??
    "-";
  const primaryPriority =
    findMapValue(recognitionMapResult.priorities, "Ana oncelik") ?? "-";
  const primaryRisk = recognitionMapResult.riskSignals[0]?.value ?? "-";

  async function refreshActiveMemoryItems() {
    const result = await apiGet<ActiveMemoryItemsResponse>(
      "/api/memory-items/active",
    );

    if (result.ok) {
      setMemoryItems(result.data.memoryItems);
    }
  }

  function openMemoryEditor(memoryItem: MemoryItemCard) {
    setSelectedMemoryItem(memoryItem);
    setEditedMemoryValue(memoryItem.value);
    setMemoryErrorMessage(null);
  }

  async function saveMemoryEdit() {
    if (!selectedMemoryItem || isMemorySaving) {
      return;
    }

    const nextValue = editedMemoryValue.trim();

    if (!nextValue) {
      setMemoryErrorMessage("Bilgi boş bırakılamaz.");
      return;
    }

    setIsMemorySaving(true);
    setMemoryErrorMessage(null);

    const result = await apiPatch<UpdateMemoryItemResponse>(
      `/api/memory-items/${selectedMemoryItem.id}`,
      {
        value: nextValue,
      },
    );

    if (result.ok) {
      setMemoryItems((current) => [
        result.data.memoryItem,
        ...current.filter((item) => item.id !== selectedMemoryItem.id),
      ]);
      setSelectedMemoryItem(null);
      setEditedMemoryValue("");
    } else {
      setMemoryErrorMessage(result.error.message);
    }

    setIsMemorySaving(false);
  }

  return (
    <section className="mt-5 rounded-[22px] bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.1em] text-indigo-600">
            TANIMA HARİTASI
          </p>
          <p className="mt-2 text-sm leading-5 text-slate-500">
            Onboarding cevaplarına göre şu an böyle anladım.
          </p>
        </div>
        <div className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600">
          %{recognitionMapResult.confidence}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RecognitionMapMetric label="İşletme tipi" value={businessType} />
        <RecognitionMapMetric label="Ana öncelik" value={primaryPriority} />
        <RecognitionMapMetric label="Ana risk" value={primaryRisk} wide />
        <RecognitionMapMetric
          label="Güven seviyesi"
          value={`%${recognitionMapResult.confidence}`}
        />
      </div>

      <div className="mt-5 space-y-4">
        {memoryItems.length > 0 ? (
          <MemoryItemList
            items={memoryItems}
            onSelect={openMemoryEditor}
            title="Senden öğrendiklerim"
          />
        ) : (
          <RecognitionMapList
            items={recognitionMapResult.learnedFromUser}
            title="Senden öğrendiklerim"
          />
        )}
        <RecognitionMapList
          items={recognitionMapResult.inferredAboutBusiness}
          title="Kullanıcı hakkında anladıklarım"
        />
        <RecognitionMapList
          items={recognitionMapResult.assumptions}
          title="Varsayımlarım"
        />
      </div>

      {selectedMemoryItem ? (
        <MemoryEditDialog
          errorMessage={memoryErrorMessage}
          isSaving={isMemorySaving}
          keyLabel={formatMemoryKey(selectedMemoryItem.key)}
          onCancel={() => setSelectedMemoryItem(null)}
          onSave={saveMemoryEdit}
          onValueChange={setEditedMemoryValue}
          value={editedMemoryValue}
        />
      ) : null}
    </section>
  );
}

function RecognitionMapMetric({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-[16px] bg-slate-50 px-3 py-3 ${
        wide ? "col-span-2" : ""
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-900">
        {value}
      </p>
    </div>
  );
}

function MemoryItemList({
  items,
  onSelect,
  title,
}: {
  items: MemoryItemCard[];
  onSelect: (item: MemoryItemCard) => void;
  title: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {items.slice(0, 4).map((item) => (
          <button
            className="flex w-full items-start justify-between gap-3 rounded-[14px] bg-slate-50 px-3 py-2 text-left transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            key={item.id}
            onClick={() => onSelect(item)}
            type="button"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-500">
                {formatMemoryKey(item.key)}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                {item.value}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-600">
              Düzenle
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MemoryEditDialog({
  errorMessage,
  isSaving,
  keyLabel,
  onCancel,
  onSave,
  onValueChange,
  value,
}: {
  errorMessage: string | null;
  isSaving: boolean;
  keyLabel: string;
  onCancel: () => void;
  onSave: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 px-3 py-4 sm:place-items-center">
      <div className="w-full max-w-[390px] rounded-[22px] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-indigo-600">
              Hafıza bilgisi
            </p>
            <h3 className="mt-1 text-lg font-black text-[#101833]">
              {keyLabel}
            </h3>
          </div>
          <button
            aria-label="Kapat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-500"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>

        <textarea
          className="min-h-32 w-full resize-none rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
          onChange={(event) => onValueChange(event.target.value)}
          value={value}
        />

        {errorMessage ? (
          <p className="mt-3 rounded-[14px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <p className="mt-3 text-xs font-medium leading-5 text-slate-500">
          Eski bilgi silinmez; yeni bilgi aktif hafıza olarak kaydedilir.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="min-h-11 rounded-full bg-slate-100 px-4 text-sm font-bold text-slate-600"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Vazgeç
          </button>
          <button
            className="min-h-11 rounded-full bg-indigo-600 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onSave}
            type="button"
          >
            {isSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecognitionMapList({
  items,
  title,
}: {
  items: RecognitionMapItem[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {items.slice(0, 2).map((item) => (
          <div
            className="flex items-start justify-between gap-3 rounded-[14px] bg-slate-50 px-3 py-2"
            key={`${title}-${item.label}-${item.value}`}
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-500">{item.label}</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                {item.value}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                item.isAssumption
                  ? "bg-amber-50 text-amber-600"
                  : "bg-teal-50 text-teal-600"
              }`}
            >
              {item.isAssumption ? "Varsayım" : "Bilgi"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function findMapValue(
  items: RecognitionMapItem[],
  label: string,
): string | undefined {
  return items.find((item) => item.label === label)?.value;
}

function formatMemoryKey(value: string): string {
  return value.replace(/_/g, " ");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function MetrixLogoMark() {
  return (
    <div className="flex flex-col items-center">
      <div className="grid h-[72px] w-[72px] place-items-center rounded-[22px] border border-[#d9ad7a] bg-[#fffdf8] shadow-[0_16px_36px_rgba(7,18,38,0.13),0_8px_22px_rgba(180,122,60,0.13),inset_0_1px_0_rgba(255,255,255,0.85)]">
        <div className="relative h-10 w-14">
          <div className="absolute left-1.5 top-2 h-8 w-6 rounded-t-full border-l-[6px] border-r-[6px] border-t-[6px] border-[#071226] [border-bottom-color:transparent]" />
          <div className="absolute right-1.5 top-2 h-8 w-6 rounded-t-full border-l-[6px] border-r-[6px] border-t-[6px] border-[#a66d35] [border-bottom-color:transparent]" />
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#8a5a2b]" />
        </div>
      </div>
      <p className="mt-4 text-[22px] font-black tracking-[0.1em] text-[#071226]">
        METRIX
      </p>
    </div>
  );
}

function LoginCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: React.ReactNode;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[13px] font-semibold leading-[1.35] text-slate-600">
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[7px] border-2 ${
          checked
            ? "border-[#a66d35] bg-[#a66d35] text-white"
            : "border-[#d9b383] bg-[#fff9ef] text-transparent"
        }`}
      >
        <IconCheck className="h-4 w-4" />
      </span>
      <input
        checked={checked}
        className="sr-only"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between border-b border-zinc-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              METRIX
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">
              {title}
            </h1>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function HeroCopy() {
  return (
    <div className="flex min-h-96 flex-col justify-center">
      <p className="text-sm font-medium text-zinc-600">AI işletme sistemi</p>
      <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-normal text-zinc-950 sm:text-5xl">
        İşletmeni tanıyan, hafızasını tutan ve ilk düzeni kuran Metrix.
      </h2>
      <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
        Kısa bir onboarding ile işletmenin yapısını anlayıp sana özel ilk
        çalışma akışını hazırlar.
      </p>
    </div>
  );
}

function Panel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-5 text-lg font-semibold tracking-normal text-zinc-950">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      {message}
    </div>
  );
}

function QuickAction({
  color,
  icon,
  label,
  onClick,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-[18px] bg-white p-3 text-center shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
      onClick={onClick}
    >
      <span className={color}>{icon}</span>
      <span className="text-[13px] font-bold leading-4 text-slate-950">
        {label}
      </span>
    </button>
  );
}

function RecommendedActionRow({
  action,
  index,
}: {
  action: ActionRecommendation;
  index: number;
}) {
  const tones = [
    "bg-indigo-100 text-indigo-600",
    "bg-teal-100 text-teal-700",
    "bg-pink-100 text-pink-600",
  ];
  const scoreTone =
    action.priorityScore >= 8
      ? "text-red-500"
      : action.priorityScore >= 7
        ? "text-indigo-600"
        : "text-teal-600";

  return (
    <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0">
      <div
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold ${
          tones[index % tones.length]
        }`}
      >
        {buildActionInitials(action.title)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold text-slate-950">
          {action.title}
        </p>
        <p className="mt-1 truncate text-sm text-slate-500">
          {action.module} / {action.actionType}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`text-sm font-bold ${scoreTone}`}>
          {action.estimatedMinutes} dk
        </span>
        <span className="text-2xl text-slate-400">›</span>
      </div>
    </div>
  );
}

function BottomNavigation() {
  const items = [
    { icon: <IconHome className="h-7 w-7" />, label: "Ana", active: true },
    { icon: <IconUsers className="h-7 w-7" />, label: "Takipler" },
    { icon: <IconTarget className="h-7 w-7" />, label: "Odaklar" },
    { icon: <IconBrain className="h-7 w-7" />, label: "Hafıza" },
    { icon: <IconUser className="h-7 w-7" />, label: "Profil" },
  ];

  return (
    <nav className="sticky bottom-0 grid grid-cols-5 border-t border-slate-100 bg-white/95 px-4 pb-5 pt-3 backdrop-blur">
      {items.map((item) => (
        <button
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            item.active ? "text-indigo-600" : "text-slate-500"
          }`}
          key={item.label}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-3">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-950">{value ?? "-"}</span>
    </div>
  );
}

function getDisplayName(user: User | null | undefined): string {
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  return firstName || "Murat";
}

function mapRecognitionAnswersToBusinessAnswers(
  answers: RecognitionAnswers,
): OnboardingAnswers {
  return {
    industry: answers.work,
    teamSize: answers.companySize,
    mainChallenge: [
      answers.biggestProblem,
      answers.dailyWork ? `Günlük uğraş: ${answers.dailyWork}` : "",
      answers.hardToTrack ? `Takip zorluğu: ${answers.hardToTrack}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    firstGoal: [
      answers.mostImportantGoal,
      answers.supportAreas ? `Destek alanları: ${answers.supportAreas}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  };
}


function buildActionInitials(title: string): string {
  const words = title
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
}

function shortenText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function InsightMetric({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-zinc-950">
        {value ?? "-"}
      </p>
    </div>
  );
}

function IconBase({
  children,
  className,
  viewBox = "0 0 24 24",
}: {
  children: React.ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox={viewBox}
    >
      {children}
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </IconBase>
  );
}

function IconTarget({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="m15 9 4-4" />
      <path d="M19 5h-3V2" />
    </IconBase>
  );
}

function IconPlay({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconBase>
  );
}

function IconBack({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
}

function IconChartBars({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 20h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-4" />
      <path d="m7 9 5-4 5 7" />
    </IconBase>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M9 21v-8h6v8" />
      <path d="M8 9h.01" />
      <path d="M12 9h.01" />
      <path d="M16 9h.01" />
    </IconBase>
  );
}

function IconBolt({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" />
    </IconBase>
  );
}

function IconMic({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </IconBase>
  );
}

function IconWave({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M4 12v2" />
      <path d="M8 8v10" />
      <path d="M12 5v14" />
      <path d="M16 8v10" />
      <path d="M20 12v2" />
    </IconBase>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M4 8h16" />
      <rect height="17" rx="3" width="18" x="3" y="4" />
    </IconBase>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </IconBase>
  );
}

function IconAlert({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

function IconBulb({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M8.5 14.5A6 6 0 1 1 15.5 14c-.9.6-1.5 1.7-1.5 3h-4c0-1.2-.6-2-1.5-2.5Z" />
    </IconBase>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.7-4" />
    </IconBase>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconBase>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M12 3 10.4 8.4 5 10l5.4 1.6L12 17l1.6-5.4L19 10l-5.4-1.6L12 3Z" />
      <path d="M5 17 4.2 19.2 2 20l2.2.8L5 23l.8-2.2L8 20l-2.2-.8L5 17Z" />
      <path d="M19 1l-.8 2.2L16 4l2.2.8L19 7l.8-2.2L22 4l-2.2-.8L19 1Z" />
    </IconBase>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </IconBase>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="m5 12 4 4 10-10" />
    </IconBase>
  );
}

function IconHome({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </IconBase>
  );
}

function IconBrain({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M9 3a3 3 0 0 0-3 3v1a4 4 0 0 0 0 8v1a3 3 0 0 0 5 2.2" />
      <path d="M15 3a3 3 0 0 1 3 3v1a4 4 0 0 1 0 8v1a3 3 0 0 1-5 2.2" />
      <path d="M12 4v16" />
    </IconBase>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </IconBase>
  );
}

function IconSignal() {
  return (
    <div className="flex h-4 items-end gap-0.5">
      <span className="h-1.5 w-1 rounded-full bg-black" />
      <span className="h-2.5 w-1 rounded-full bg-black" />
      <span className="h-3.5 w-1 rounded-full bg-black" />
      <span className="h-4 w-1 rounded-full bg-black" />
    </div>
  );
}

function IconWifi() {
  return (
    <IconBase className="h-5 w-5 text-black" viewBox="0 0 24 24">
      <path d="M5 9.5a11 11 0 0 1 14 0" />
      <path d="M8.5 13a6 6 0 0 1 7 0" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

function IconBattery() {
  return (
    <div className="flex h-4 w-7 items-center rounded-[4px] border-2 border-black p-0.5">
      <div className="h-full w-4 rounded-[2px] bg-black" />
    </div>
  );
}

function buildRecognitionInsightViewModel(
  profile: RecognitionProfile,
): RecognitionInsight {
  if (profile.insight) {
    return profile.insight;
  }

  return {
    headline: profile.summary,
    businessType: profile.businessType,
    operationalPriority: profile.priorities[0] ?? profile.recommendedFirstSetupStep,
    mainBottleneck: profile.risks[0] ?? "Bilgi ve takip dağınıklığı",
    recommendedFirstModule: profile.recommendedFirstSetupStep,
    sevenDayPlan: [
      {
        phase: "Gün 1-2",
        title: "Mevcut bilgiyi toparla",
        action: "İşletme hafızasına girecek temel notları ve sorumluları belirle.",
      },
      {
        phase: "Gün 3-4",
        title: "İlk takip alanını kur",
        action: profile.recommendedFirstSetupStep,
      },
      {
        phase: "Gün 5-7",
        title: "Haftalık ritmi başlat",
        action: "Öncelikleri haftalık kontrol listesine çevir.",
      },
    ],
    riskWarnings: profile.risks,
    nextBestActions: profile.priorities,
    confidence: 60,
    generatedBy: "deterministic",
    version: "fallback",
  };
}

async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    credentials: "include",
  });

  return {
    ...((await response.json()) as ApiResponse<T>),
    status: response.status,
  };
}

async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return {
    ...((await response.json()) as ApiResponse<T>),
    status: response.status,
  };
}

async function apiPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return {
    ...((await response.json()) as ApiResponse<T>),
    status: response.status,
  };
}
