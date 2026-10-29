"use client";
import { Stethoscope } from "lucide-react";
import { reasonsFor } from "@/lib/domain/reasons";
import type { Lang, ShopKind } from "@/lib/domain/types";
import { reasonText, t } from "@/lib/i18n";

/**
 * سبب الزيارة: أزرار كبيرة (أسهل من قائمة منسدلة لكبار السنّ).
 * required: نموذج المريض لا يُرسل دون اختيار (تحقّق المتصفّح الأصلي).
 * لا شيء يُعرض لأنواع لا أسباب لها (حلّاق…).
 */
export default function ReasonPicker({
  lang,
  kind,
  value,
  onChange,
  required = false,
  idPrefix = "reason",
}: {
  lang: Lang;
  kind: ShopKind;
  value: string | null;
  onChange: (v: string | null) => void;
  required?: boolean;
  idPrefix?: string;
}) {
  const list = reasonsFor(kind);
  if (!list.length) return null;
  return (
    <fieldset data-testid={`${idPrefix}-picker`}>
      <legend className="label flex items-center gap-1.5">
        <Stethoscope size={15} className="text-brand-600" /> {t(lang, required ? "vr_label" : "vr_labelOptional")}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {list.map((r) => (
          <label
            key={r}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm leading-snug font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:ring-brand-300 has-checked:bg-brand-50 has-checked:text-brand-900 has-checked:ring-2 has-checked:ring-brand-500"
          >
            <input
              type="radio"
              name={idPrefix}
              value={r}
              checked={value === r}
              onChange={() => onChange(r)}
              onClick={() => !required && value === r && onChange(null)}
              required={required}
              className="size-4 shrink-0 accent-brand-600"
            />
            {reasonText(lang, r)}
          </label>
        ))}
      </div>
      {required && <p className="mt-1.5 text-xs text-slate-500">{t(lang, "vr_private")}</p>}
    </fieldset>
  );
}
