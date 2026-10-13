import { handle, readJson, requireOwner } from "@/lib/server/http";
import { getReportSettings, saveReportSettings } from "@/lib/server/report";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => getReportSettings(await requireOwner(slug)));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    return saveReportSettings(shop, await readJson(req));
  });
}
