import { handle, readJson, requireOwner } from "@/lib/server/http";
import { reasonSettingsView, saveReasonSettings } from "@/lib/server/reason-settings";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => reasonSettingsView(await requireOwner(slug)));
}

/** {mode: "off" | "list" | "text", required: boolean, options: string[]} — صاحب العيادة فقط. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => saveReasonSettings(await requireOwner(slug), await readJson(req)));
}
