import { DomainError } from "@/lib/domain/types";
import { baseUrl, json, serverError } from "@/lib/server/http";
import { appointmentIcs } from "@/lib/server/appointments";

/** «أضف إلى التقويم»: ملفّ .ics يفتحه تطبيق التقويم (مع تذكير قبل ساعة). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { body, filename } = await appointmentIcs(id, await baseUrl());
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}
