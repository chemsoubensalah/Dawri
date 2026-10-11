import { safeEqual } from "@/lib/server/auth";
import { handleWhatsappInbound } from "@/lib/server/service";
import { verifySignature, waConfig } from "@/lib/server/whatsapp";

/** تحقّق Meta عند حفظ رابط الـ Webhook: نُعيد hub.challenge إن طابق رمز التحقّق. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = waConfig().verifyToken;
  if (mode === "subscribe" && expected && safeEqual(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** رسائل المرضى الواردة. نتحقّق من التوقيع على الجسم الخام قبل أيّ شيء. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), waConfig().appSecret)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    await handleWhatsappInbound(JSON.parse(raw));
  } catch (e) {
    console.error("[whatsapp] webhook", e);
  }
  // نردّ 200 دائماً بعد توقيع صحيح كي لا تعيد Meta الإرسال بلا نهاية (المعالجة متكرّرة-الآمنة)
  return new Response("ok", { status: 200 });
}
