import { DomainError } from "@/lib/domain/types";
import { json, readJson, requireStaff, serverError, setSessionCookie } from "@/lib/server/http";
import { now } from "@/lib/server/clock";
import { sessionFor, updateSettings } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const shop = await requireStaff(slug);
    const updated = await updateSettings(shop, await readJson(req));
    const res = json({ ok: true });
    // تغيير الرمز يُبطل كلّ الجلسات الأخرى؛ نُبقي هذا الجهاز مسجَّلاً
    if (updated.sessionVersion !== shop.sessionVersion) setSessionCookie(res, updated, sessionFor(updated, now()));
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
