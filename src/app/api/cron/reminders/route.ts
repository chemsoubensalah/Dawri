import { safeEqual } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { sendMorningReminders } from "@/lib/server/reminders";

/** مهلة التنفيذ (ث): الإرسال يتوقّف عند 45 ث ويُكمله نشاط العيادة التالي. */
export const maxDuration = 60;

/**
 * تذكير صباح يوم الموعد (src/lib/server/reminders.ts). Vercel Cron يوميّاً 06:00 UTC (= 07:00–08:00 بالجزائر)؛
 * على خادم آخر: crontab يستدعيه بنفس الترويسة، مثلاً كلّ يوم 07:05:
 *   5 7 * * *  curl -s -H "Authorization: Bearer $CRON_SECRET" https://<الموقع>/api/cron/reminders
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
  return json(await sendMorningReminders({ base: new URL(req.url).origin }));
}
