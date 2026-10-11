import { safeEqual } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { runCron } from "@/lib/server/service";

/** يُستدعى يومياً من Vercel Cron: يُغلق تذاكر الأمس، ويمحو سجلّ الغياب الأقدم من شهرين. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
  return json(await runCron());
}
