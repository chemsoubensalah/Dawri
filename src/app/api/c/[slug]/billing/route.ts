import { createClinicCheckout } from "@/lib/server/billing";
import { requireManager } from "@/lib/server/clinicHttp";
import { baseUrl, getLang, handle, readJson } from "@/lib/server/http";

/** اشتراك العيادة متعدّدة الأطبّاء: صفحة دفع Chargily جديدة (مدير العيادة فقط). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const clinic = await requireManager(slug);
    const body = await readJson(req);
    return createClinicCheckout(clinic, Number(body.months), await getLang(), await baseUrl());
  });
}
