import { handle, readJson, requireOwner } from "@/lib/server/http";
import { setReviewHidden } from "@/lib/server/reviews";

/** إخفاء/إظهار تعليق — صاحب العيادة فقط، ولتقييمات عيادته فقط. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    const body = await readJson(req);
    return setReviewHidden(shop, body.id, body.hidden);
  });
}
