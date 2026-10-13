import { getDb } from "@/lib/server/db";
import { handle, readJson, requireOwner } from "@/lib/server/http";
import { getReviewSettings, saveReviewSettings } from "@/lib/server/reviews";

/** إعدادات ظهور التقييمات والدليل — صاحب العيادة فقط. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    return { ...(await getReviewSettings(await getDb(), shop.id)), wilaya: shop.profile.wilaya };
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    return saveReviewSettings(shop, await readJson(req));
  });
}
