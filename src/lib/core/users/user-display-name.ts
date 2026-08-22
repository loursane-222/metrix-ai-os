import type { UserResult } from "./user.types";

// fullName is optional on User (set during onboarding, not always
// completed), so notifications fell back to a fully anonymous "Bir ekip
// üyesi" whenever it was empty — even though phone is a required, unique
// field and therefore always available to identify the actor by. Prefer
// name, then email, then a masked phone before giving up entirely.
export function resolveActorDisplayName(actor: UserResult | null | undefined): string {
  const fullName = actor?.fullName?.trim();
  if (fullName) return fullName;
  const email = actor?.email?.trim();
  if (email) return email;
  const phone = actor?.phone?.trim();
  if (phone) return maskPhone(phone);
  return "Bir ekip üyesi";
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  return `•••${digits.slice(-4)}`;
}
