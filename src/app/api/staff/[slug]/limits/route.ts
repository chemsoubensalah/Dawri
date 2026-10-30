import { handle, readJson, requireOwner } from "@/lib/server/http";
import { limitsSettingsView, saveLimitsSettings } from "@/lib/server/limits";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => limitsSettingsView(await requireOwner(slug)));
}

/** {phoneDays: 0–30, phoneScope: "appts" | "all", staffOverride: boolean} — صاحب العيادة فقط. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => saveLimitsSettings(await requireOwner(slug), await readJson(req)));
}
