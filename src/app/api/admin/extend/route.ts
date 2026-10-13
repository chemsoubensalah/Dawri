import { DomainError } from "@/lib/domain/types";
import { isAdmin } from "@/lib/server/admin";
import { recordManualClinicPayment, recordManualPayment } from "@/lib/server/billing";
import { handle, readJson } from "@/lib/server/http";

/** تفعيل يدوي بعد تحويل بريدي: يسجّل دفعة ويمدّد اشتراك طابور (shopId) أو عيادة متعدّدة الأطبّاء (clinicId). */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new DomainError("unauthorized", 401);
    const b = await readJson(req);
    const months = Number(b.months);
    const amount = Math.max(0, Math.round(Number(b.amount) || 0));
    const note = typeof b.note === "string" ? b.note.slice(0, 200) : null;
    const until =
      typeof b.clinicId === "string" && b.clinicId
        ? await recordManualClinicPayment(b.clinicId, months, amount, note)
        : await recordManualPayment(String(b.shopId), months, amount, note);
    return { paidUntil: until?.toISOString() ?? null };
  });
}
