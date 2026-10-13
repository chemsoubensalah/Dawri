import { clinicCookieName } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { clinicBySlug } from "@/lib/server/clinicHttp";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clinic = await clinicBySlug(slug);
  const res = json({ ok: true });
  if (clinic) res.cookies.delete(clinicCookieName(clinic.id));
  return res;
}
