import { createCheckout } from "@/lib/server/billing";
import { baseUrl, getLang, handle, readJson, requireStaff } from "@/lib/server/http";

/** يُنشئ صفحة دفع Chargily جديدة عند الضغط (تنتهي صلاحيتها بعد 30 دقيقة). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireStaff(slug);
    const body = await readJson(req);
    return createCheckout(shop, Number(body.months), await getLang(shop.defaultLang), await baseUrl());
  });
}
