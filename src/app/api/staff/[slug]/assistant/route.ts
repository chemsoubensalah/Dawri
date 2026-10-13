import { handle, readJson, requireDoctor } from "@/lib/server/http";
import { leaveClinic, setAssistantPin } from "@/lib/server/clinics";

/** هل للسكرتيرة رمز؟ وهل الطابور عضو في عيادة متعدّدة الأطبّاء؟ (الطبيب وحده) */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireDoctor(slug);
    return { hasPin: Boolean(shop.assistantPinHash), inClinic: Boolean(shop.clinicId) };
  });
}

/** {pin: "1234"} يضبط/يغيّر، {pin: null} يحذف، {leaveClinic: true} يغادر العيادة. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireDoctor(slug);
    const body = await readJson(req);
    if (body.leaveClinic === true) return leaveClinic(shop);
    return setAssistantPin(shop, body.pin ?? null);
  });
}
