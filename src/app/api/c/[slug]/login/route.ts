import { DomainError } from "@/lib/domain/types";
import { json, readJson, serverError } from "@/lib/server/http";
import { clinicLogin } from "@/lib/server/clinics";
import { setClinicCookie } from "@/lib/server/clinicHttp";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await readJson(req);
    const { clinic, token } = await clinicLogin(slug, body.pin);
    const res = json({ ok: true });
    setClinicCookie(res, clinic, token);
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
