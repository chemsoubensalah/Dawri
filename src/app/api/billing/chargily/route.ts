import { handleChargilyEvent, verifyChargilySignature } from "@/lib/server/billing";

/** أحداث Chargily: نتحقّق من ترويسة `signature` على الجسم الخام، ثمّ نفعّل الاشتراك. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  if (!verifyChargilySignature(raw, sig)) return new Response("bad signature", { status: 403 });
  try {
    await handleChargilyEvent(JSON.parse(raw));
  } catch (e) {
    console.error("[chargily] webhook", e);
    return new Response("error", { status: 500 }); // تعيد Chargily المحاولة
  }
  return new Response("ok", { status: 200 });
}
