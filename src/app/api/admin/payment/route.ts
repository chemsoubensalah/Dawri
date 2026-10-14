import { DomainError } from "@/lib/domain/types";
import { isAdmin } from "@/lib/server/admin";
import { adminSetPaymentAmount } from "@/lib/server/billing";
import { handle, readJson } from "@/lib/server/http";

/** لوحة المؤسّس: تصحيح مبلغ دفعة يدوية (مثلاً جعلها «مجانية» = 0 دج) — يغيّر المداخيل فقط، لا مدّة الاشتراك. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new DomainError("unauthorized", 401);
    const b = await readJson(req);
    return adminSetPaymentAmount(b.id, b.amount, b.note);
  });
}
