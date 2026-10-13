import { handle, readJson } from "@/lib/server/http";
import { requestBookingCode } from "@/lib/server/appointments";

/** رمز التحقّق برسالة قصيرة قبل الحجز (نفس الحدود: 3 كلّ نصف ساعة لكلّ رقم). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => requestBookingCode(slug, await readJson(req)));
}
