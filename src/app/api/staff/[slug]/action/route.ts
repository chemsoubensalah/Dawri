import { DomainError } from "@/lib/domain/types";
import { handle, readJson, staffAccess } from "@/lib/server/http";
import { staffAction, staffState } from "@/lib/server/service";

/** ينفّذ الفعل ثمّ يُرجع الحالة الجديدة مباشرة (طلب واحد على شبكة بطيئة). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const access = await staffAccess(slug);
    if (!access) throw new DomainError("unauthorized", 401);
    const { shop, role } = access;
    // الدور يُسجَّل مع «إيقاف الاستقبال» ليعرف الطرف الآخر من أوقفه
    const result = await staffAction(shop, await readJson(req), role);
    return { result, state: await staffState(shop) };
  });
}
