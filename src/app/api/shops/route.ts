import { DomainError } from "@/lib/domain/types";
import { now } from "@/lib/server/clock";
import { json, readJson, setSessionCookie } from "@/lib/server/http";
import { createShop, sessionFor } from "@/lib/server/service";

export async function POST(req: Request) {
  try {
    const shop = await createShop(await readJson(req));
    const res = json({ slug: shop.slug });
    setSessionCookie(res, shop, sessionFor(shop, now()));
    return res;
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    console.error(e);
    return json({ error: "generic" }, 500);
  }
}
