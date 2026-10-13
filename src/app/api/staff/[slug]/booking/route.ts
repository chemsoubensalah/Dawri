import { handle, readJson, requireOwner } from "@/lib/server/http";
import { bookingSettingsView, saveBookingSettings } from "@/lib/server/appointments";

/** إعدادات المواعيد — صاحب العيادة فقط. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => bookingSettingsView(await requireOwner(slug)));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    await saveBookingSettings(shop, await readJson(req));
    return bookingSettingsView(shop);
  });
}
