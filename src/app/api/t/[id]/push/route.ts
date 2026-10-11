import { handle, readJson } from "@/lib/server/http";
import { savePush } from "@/lib/server/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => savePush(id, await readJson(req)));
}
