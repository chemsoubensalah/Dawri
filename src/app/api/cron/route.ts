import { safeEqual } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { runCron } from "@/lib/server/service";

/**
 * مهلة التنفيذ (ث) — Route Segment Config. التقارير اليومية تتوقّف عند 45 ث وتُستكمل في التشغيل التالي.
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md)
 */
export const maxDuration = 60;

/**
 * يُستدعى يومياً من Vercel Cron: يُغلق تذاكر الأمس، ويمحو سجلّ الغياب الأقدم من شهرين، ويرسل التقارير.
 * كلّ خطوة معزولة؛ إن فشلت واحدة أو أكثر يُعاد 500 مع النتائج وerrors (يظهر في سجلّ Vercel Cron).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
  const result = await runCron();
  return json(result, result.errors.length ? 500 : 200);
}
