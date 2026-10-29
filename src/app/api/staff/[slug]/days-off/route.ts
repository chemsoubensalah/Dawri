import { handle, readJson, requireOwner } from "@/lib/server/http";
import { daysOffView, saveDaysOff } from "@/lib/server/daysoff";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => daysOffView(await requireOwner(slug)));
}

/** {items: {day, label}[]} — يستبدل القائمة كلّها (صاحب العيادة فقط). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => saveDaysOff(await requireOwner(slug), (await readJson(req)).items));
}
