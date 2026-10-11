import { DomainError } from "@/lib/domain/types";
import { json, readJson, serverError, setSessionCookie } from "@/lib/server/http";
import { staffLogin } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await readJson(req);
    const { shop, token } = await staffLogin(slug, body.pin);
    const res = json({ ok: true });
    setSessionCookie(res, shop, token);
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
