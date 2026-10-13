import { handle, readJson } from "@/lib/server/http";
import { clientIp } from "@/lib/server/ratelimit";
import { requestCode } from "@/lib/server/service";

/** رمز التحقّق لأخذ رقم (حدود لكلّ رقم، لكلّ عيادة، ولكلّ عميل — عنوان IP). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => requestCode(slug, await readJson(req), { ip: clientIp(req.headers) }));
}
