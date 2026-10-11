import { handle, requireStaff } from "@/lib/server/http";
import { staffState } from "@/lib/server/service";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => staffState(await requireStaff(slug)));
}
