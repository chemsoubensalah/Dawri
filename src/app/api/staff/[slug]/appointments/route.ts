import { handle, readJson, requireStaff } from "@/lib/server/http";
import { staffAppointmentAction, staffAppointments } from "@/lib/server/appointments";

/** ?scope=today (لوحة الطابور، افتراضي) أو ?scope=upcoming (صفحة المواعيد). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const scope = new URL(req.url).searchParams.get("scope") === "upcoming" ? "upcoming" : "today";
  return handle(async () => staffAppointments(await requireStaff(slug), scope));
}

/** { action: "book" | "checkin" | "cancel", … } — يُرجع النتيجة والقائمة الجديدة في طلب واحد. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const scope = new URL(req.url).searchParams.get("scope") === "upcoming" ? "upcoming" : "today";
  return handle(async () => {
    const shop = await requireStaff(slug);
    const result = await staffAppointmentAction(shop, await readJson(req));
    return { result, state: await staffAppointments(shop, scope) };
  });
}
