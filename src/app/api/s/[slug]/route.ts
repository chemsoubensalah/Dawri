import { handle } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => (await publicShop(slug)).view);
}
