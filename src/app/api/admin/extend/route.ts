import { DomainError } from "@/lib/domain/types";
import { isAdmin } from "@/lib/server/admin";
import { recordManualPayment } from "@/lib/server/billing";
import { handle, readJson } from "@/lib/server/http";

/** تفعيل يدوي بعد تحويل بريدي: يسجّل دفعة ويمدّد الاشتراك. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new DomainError("unauthorized", 401);
    const b = await readJson(req);
    const until = await recordManualPayment(String(b.shopId), Number(b.months), Math.max(0, Math.round(Number(b.amount) || 0)), typeof b.note === "string" ? b.note.slice(0, 200) : null);
    return { paidUntil: until?.toISOString() ?? null };
  });
}
