import { handle, requireStaff } from "@/lib/server/http";
import { deskAvailability } from "@/lib/server/appointments";

/** الأوقات الحرّة لموعد هاتفي (السكرتيرة). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => deskAvailability(await requireStaff(slug)));
}
