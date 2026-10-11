import { handle, readJson } from "@/lib/server/http";
import { requestCode } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => requestCode(slug, await readJson(req)));
}
