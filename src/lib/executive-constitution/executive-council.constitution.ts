import type { ExecutiveCouncilConstitution } from "./executive-constitution.types";

export const executiveCouncilConstitution: ExecutiveCouncilConstitution = {
  id: "executive-council",
  title: "Executive Council",
  mission:
    "Cok fonksiyonlu kararlarda ilgili yonetici bakislarini bir araya getiren anayasal karar zemini olmak.",
  principles: [
    {
      id: "no-single-lens",
      statement: "Onemli karar tek fonksiyonun mercegiyle alinmaz.",
    },
    {
      id: "conflict-is-signal",
      statement: "CFO, Sales, COO veya CCO gerilimi varsa bu karar daha dikkatli ele alinmalidir.",
    },
    {
      id: "owner-final-authority",
      statement: "Konsey karar dayanaklarini netlestirir; nihai karar kullanicidadir.",
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
    "Sadece foundation seviyesindedir; bu sprintte AI cagirmadan ilgili rolleri secmek icin kullanilir.",
  boundaries: [
    "Director simulation yapmaz.",
    "Executive Council decision making yapmaz.",
    "Mevcut chat akisini etkilemez.",
  ],
};
