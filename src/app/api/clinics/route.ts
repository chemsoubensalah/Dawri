import { DomainError } from "@/lib/domain/types";
import { now } from "@/lib/server/clock";
import { json, readJson, serverError, setSessionCookie } from "@/lib/server/http";
import { clinicSessionFor, createClinic } from "@/lib/server/clinics";
import { setClinicCookie } from "@/lib/server/clinicHttp";
import { sessionFor } from "@/lib/server/service";

/** تسجيل عيادة بعدّة أطبّاء + طبيبها الأوّل (نفس فحص رمز التسجيل كإنشاء طابور). */
export async function POST(req: Request) {
  try {
    const { clinic, shop } = await createClinic(await readJson(req));
    const t = now();
    const res = json({ slug: clinic.slug, shop: shop.slug });
    setClinicCookie(res, clinic, clinicSessionFor(clinic, t));
    setSessionCookie(res, shop, sessionFor(shop, t));
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
