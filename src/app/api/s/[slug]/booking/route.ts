import { NextResponse } from "next/server";
import { DomainError } from "@/lib/domain/types";
import { handle, readJson, serverError } from "@/lib/server/http";
import { clientIp } from "@/lib/server/ratelimit";
import { bookOnline, publicAvailability } from "@/lib/server/appointments";

/**
 * الأيّام والأوقات المتاحة للحجز. عامّ ورخيص: يُخزَّن قليلاً في الـCDN
 * (حجز وقت مأخوذ للتوّ يُرفض بوضوح عند التأكيد، فلا ضرر من 15 ثانية).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    return NextResponse.json(await publicAvailability(slug), {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.code }, { status: e.status, headers: { "Cache-Control": "no-store" } });
    return serverError(e);
  }
}

/** الحجز (بعد رمز التحقّق إن كان مفعّلاً). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => bookOnline(slug, await readJson(req), { ip: clientIp(req.headers) }));
}
