import type { ExecutiveCouncilConstitution } from "./executive-constitution.types";

export const executiveCouncilConstitution: ExecutiveCouncilConstitution = {
  id: "executive-council",
  title: "Executive Council",
  mission:
    "Çok fonksiyonlu kararlarda ilgili yönetici bakışlarını bir araya getiren anayasal karar zemini olmak.",
  principles: [
    {
      id: "no-single-lens",
      statement: "Önemli karar tek fonksiyonun mercegiyle alınmaz.",
    },
    {
      id: "conflict-is-signal",
      statement: "CFO, Sales, COO veya CCO gerilimi varsa bu karar daha dikkatli ele alinmalidir.",
    },
    {
      id: "owner-final-authority",
      statement: "Konsey karar dayanaklarını netleştirir; nihai karar kullanıcıdadır.",
    },
  ],
  memberRoles: [
    "general-manager",
    "cfo",
    "sales",
    "coo",
    "chro",
    "cco",
    "cmo",
    "executive-assistant",
  ],
  activationRule:
    "Sadece foundation seviyesindedir; bu sprintte AI çağırmadan ilgili rolleri seçmek için kullanılır.",
  boundaries: [
    "Director simulation yapmaz.",
    "Executive Council decision making yapmaz.",
    "Mevcut chat akışını etkilemez.",
  ],
};
