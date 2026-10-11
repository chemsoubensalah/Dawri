import { handle, readJson, requireStaff } from "@/lib/server/http";
import { staffAction, staffState } from "@/lib/server/service";

/** ينفّذ الفعل ثمّ يُرجع الحالة الجديدة مباشرة (طلب واحد على شبكة بطيئة). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireStaff(slug);
    const result = await staffAction(shop, await readJson(req));
    return { result, state: await staffState(shop) };
  });
}
