import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";
import type { DoctorStatus } from "@/lib/server/clinics";

/** شارة حالة الطبيب (مشتركة بين صفحة المرضى ولوحة المدير). */
export function StatusBadge({ lang, status, resumesAt }: { lang: Lang; status: DoctorStatus; resumesAt?: string | null }) {
  const tone =
    status === "open"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "break" || status === "later"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  const dot = status === "open" ? "bg-emerald-500" : status === "break" || status === "later" ? "bg-amber-500" : "bg-slate-400";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot} ${status === "open" ? "animate-pulse" : ""}`} />
      {t(lang, `cl_st_${status}`)}
      {resumesAt && (status === "break" || status === "later") && (
        <span className="num" dir="ltr">
          {resumesAt}
        </span>
      )}
    </span>
  );
}
