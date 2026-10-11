import { handle, readJson } from "@/lib/server/http";
import { takeTicket } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => takeTicket(slug, await readJson(req)));
}
