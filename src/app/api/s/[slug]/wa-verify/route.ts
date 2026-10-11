import { handle, readJson } from "@/lib/server/http";
import { startWaVerification } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => startWaVerification(slug, await readJson(req)));
}
