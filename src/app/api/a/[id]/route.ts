import { handle, readJson } from "@/lib/server/http";
import { appointmentAction, appointmentView } from "@/lib/server/appointments";

/** صفحة الموعد: المعرّف (uuid عشوائي) هو المفتاح — لا يكشف أيّ موعد آخر. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => appointmentView(id));
}

/** { action: "cancel" } أو { action: "checkin", door? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => appointmentAction(id, await readJson(req)));
}
