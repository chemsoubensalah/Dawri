import { handle, readJson } from "@/lib/server/http";
import { ticketAction, ticketView } from "@/lib/server/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => ticketView(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ticketAction(id, await readJson(req)));
}
