import { handle, readJson, requireOwner } from "@/lib/server/http";
import { printSettingsView, savePrintSettings } from "@/lib/server/print-settings";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => printSettingsView(await requireOwner(slug)));
}

/** {paper: 58 | 80, size: "s" | "m" | "l", qr: boolean} — صاحب العيادة فقط. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => savePrintSettings(await requireOwner(slug), await readJson(req)));
}
