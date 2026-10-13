import { handle, readJson, requireOwner } from "@/lib/server/http";
import { sendReportPreview } from "@/lib/server/report";

/** «أرسل لي تقرير الأمس الآن» — إلى بريد الاستعادة فقط (لا عنوان من الطلب). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(async () => {
    const shop = await requireOwner(slug);
    await readJson(req); // JSON فقط: يمنع الإرسال من نماذج مواقع أخرى
    return sendReportPreview(shop);
  });
}
