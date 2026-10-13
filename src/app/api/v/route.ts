import { after } from "next/server";
import { recordVisit } from "@/lib/server/analytics";
import { clientIp } from "@/lib/server/ratelimit";

/** عدّاد الزيارات (navigator.sendBeacon): يردّ فوراً ويكتب في الخلفية. لا كوكي ولا IP محفوظ. */
export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length > 0 && text.length <= 1000) {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text);
    } catch {}
    const ua = req.headers.get("user-agent") ?? "";
    const ip = clientIp(req.headers);
    let ownHost: string | null = null;
    try {
      ownHost = new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).hostname.toLowerCase();
    } catch {}
    after(() => recordVisit({ path: body.p, referrer: body.r, qr: body.q, ip, ua, ownHost }).catch((e) => console.error("[visit]", e)));
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
