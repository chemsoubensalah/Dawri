import { handle } from "@/lib/server/http";
import { waVerificationStatus } from "@/lib/server/service";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return handle(() => waVerificationStatus(slug, id));
}
