import { sessionCookieName } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { json } from "@/lib/server/http";
import * as repo from "@/lib/server/repo";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await repo.getShopBySlug(await getDb(), slug.toLowerCase());
  const res = json({ ok: true });
  if (shop) res.cookies.delete(sessionCookieName(shop.id));
  return res;
}
