import { handle, readJson, trustedBaseUrl } from "@/lib/server/http";
import { requestPinReset } from "@/lib/server/service";

/** «نسيت الرمز»: يرسل رابط إعادة التعيين إلى بريد العيادة (الجواب واحد دائماً). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => requestPinReset(slug, (await readJson(req)).email, await trustedBaseUrl()));
}
