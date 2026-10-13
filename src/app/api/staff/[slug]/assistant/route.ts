import { handle, readJson, requireOwner } from "@/lib/server/http";
import { setAssistantPin } from "@/lib/server/clinics";

/** هل للسكرتيرة رمز؟ (صاحب العيادة فقط) */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => ({ hasPin: Boolean((await requireOwner(slug)).assistantPinHash) }));
}

/** {pin: "1234"} يضبط/يغيّر، {pin: null} يحذف. كلّ تغيير يُخرج أجهزة السكرتيرة. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    const body = await readJson(req);
    return setAssistantPin(shop, body.pin ?? null);
  });
}
