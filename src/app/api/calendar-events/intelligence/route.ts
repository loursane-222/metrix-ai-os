import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { computeAvailability, computeDailyCapacity, computeExecutiveRhythm } from "@/lib/core/calendar/calendar-intelligence.service";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies(); const query = new URL(request.url).searchParams;
    const memberId = query.get("memberId"); if (!memberId) return fail("memberId zorunludur.", 400);
    const at = new Date(query.get("at") ?? Date.now()); if (Number.isNaN(at.getTime())) return fail("Geçerli bir tarih girin.", 400);
    const [availability, capacity, rhythm] = await Promise.all([computeAvailability(memberId, auth.organization.id, at), computeDailyCapacity(memberId, auth.organization.id, at), computeExecutiveRhythm(memberId, auth.organization.id)]);
    return ok({ availability, capacity, rhythm });
  } catch (error) { return authFail(error); }
}
