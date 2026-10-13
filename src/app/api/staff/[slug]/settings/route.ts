import { DomainError } from "@/lib/domain/types";
import { json, readJson, requireOwner, serverError, setSessionCookie, staffRole } from "@/lib/server/http";
import { now } from "@/lib/server/clock";
import { sessionFor, updateSettings } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const shop = await requireOwner(slug);
    const body = await readJson(req);
    const role = await staffRole(slug);
    // رمز الطبيب وبريد الاستعادة: للطبيب وحده (لا لمدير العيادة)
    if (role !== "owner" && (body.newPin || body.email !== undefined)) throw new DomainError("forbidden", 403);
    const updated = await updateSettings(shop, body);
    const res = json({ ok: true });
    // تغيير الرمز يُبطل كلّ الجلسات الأخرى؛ نُبقي هذا الجهاز مسجَّلاً
    if (role === "owner" && updated.sessionVersion !== shop.sessionVersion) setSessionCookie(res, updated, sessionFor(updated, now()));
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
