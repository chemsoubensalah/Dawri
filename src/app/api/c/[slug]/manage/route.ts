import { DomainError } from "@/lib/domain/types";
import { getLang, handle, json, readJson, serverError } from "@/lib/server/http";
import { now } from "@/lib/server/clock";
import * as clinics from "@/lib/server/clinics";
import { requireManager, setClinicCookie } from "@/lib/server/clinicHttp";

/** لوحة المدير الحيّة. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => clinics.managerView(await requireManager(slug)));
}

/** إجراءات المدير: add | join | room | remove | pin */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const clinic = await requireManager(slug);
    const body = await readJson(req);
    switch (body.action) {
      case "add": {
        const shop = await clinics.addDoctor(clinic, body, await getLang());
        return json({ ok: true, slug: shop.slug });
      }
      case "join": {
        const shop = await clinics.joinDoctor(clinic, body);
        return json({ ok: true, slug: shop.slug });
      }
      case "room":
        return json(await clinics.setDoctorRoom(clinic, body.shop, body.room));
      case "remove":
        return json(await clinics.removeDoctor(clinic, body.shop));
      case "pin": {
        const updated = await clinics.changeClinicPin(clinic, body.pin, body.currentPin);
        const res = json({ ok: true });
        setClinicCookie(res, updated, clinics.clinicSessionFor(updated, now()));
        return res;
      }
      default:
        throw new DomainError("bad_request", 400);
    }
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
