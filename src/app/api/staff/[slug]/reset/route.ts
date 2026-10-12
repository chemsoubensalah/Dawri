import { DomainError } from "@/lib/domain/types";
import { json, readJson, serverError, setSessionCookie } from "@/lib/server/http";
import { resetPinWithToken } from "@/lib/server/service";

/** رمز جديد من رابط البريد ← دخول مباشر. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await readJson(req);
    const { shop, token } = await resetPinWithToken(slug, body.token, body.pin);
    const res = json({ ok: true });
    setSessionCookie(res, shop, token);
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
