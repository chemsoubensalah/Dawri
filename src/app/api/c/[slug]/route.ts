import { handle } from "@/lib/server/http";
import { clinicPublic } from "@/lib/server/clinics";

/** حالة كلّ أطبّاء العيادة (عامّة: أرقام وأعداد فقط) — لصفحة المرضى وشاشة القاعة. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(() => clinicPublic(slug));
}
