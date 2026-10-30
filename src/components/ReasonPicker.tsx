"use client";
import { Stethoscope } from "lucide-react";
import { REASON_TEXT_MAX, type ReasonConfig } from "@/lib/domain/reasons";
import type { Lang } from "@/lib/domain/types";
import { t } from "@/lib/i18n";

/**
 * سبب الزيارة كما قرّره الطبيب (الإعدادات ← «سبب الزيارة»):
 * list = أزرار كبيرة بالاختيارات التي كتبها (أسهل من قائمة منسدلة لكبار السنّ)، text = نصّ قصير يكتبه المريض.
 * required: النموذج لا يُرسل دون جواب (تحقّق المتصفّح الأصلي). السكرتيرة: دائماً اختياري.
 * full: حالات بلغت حدّها اليوميّ — معطَّلة للمريض، ومعلَّمة فقط للسكرتيرة إن سمح لها الطبيب بالتجاوز.
 */
export default function ReasonPicker({
  lang,
  config,
  value,
  onChange,
  required = false,
  idPrefix = "reason",
  preview = false,
  full = [],
  fullSelectable = false,
}: {
  lang: Lang;
  config: ReasonConfig;
  value: string | null;
  onChange: (v: string | null) => void;
  required?: boolean;
  idPrefix?: string;
  /** معاينة داخل نموذج الإعدادات: يبدو إجبارياً دون أن يمنع حفظ النموذج */
  preview?: boolean;
  full?: readonly string[];
  fullSelectable?: boolean;
}) {
  const block = required && !preview;
  if (config.mode === "off" || (config.mode === "list" && !config.options.length)) return null;
  const legend = (
    <>
      <Stethoscope size={15} className="text-brand-600" /> {t(lang, required ? "vr_label" : "vr_labelOptional")}
    </>
  );
  const hint = required && <p className="mt-1.5 text-xs text-slate-500">{t(lang, "vr_private")}</p>;

  if (config.mode === "text") {
    return (
      <div data-testid={`${idPrefix}-picker`}>
        <label className="label flex items-center gap-1.5" htmlFor={`${idPrefix}-text`}>
          {legend}
        </label>
        <textarea
          id={`${idPrefix}-text`}
          className="input min-h-14 resize-none py-2.5 leading-relaxed"
          rows={2}
          maxLength={REASON_TEXT_MAX}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={t(lang, "vr_textPh")}
          required={block}
        />
        {hint}
      </div>
    );
  }

  return (
    <fieldset data-testid={`${idPrefix}-picker`}>
      <legend className="label flex items-center gap-1.5">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {config.options.map((r) => {
          const isFull = full.includes(r);
          const off = isFull && !fullSelectable;
          return (
            <label
              key={r}
              className={`flex min-h-12 items-center gap-2 rounded-2xl px-3 py-2 text-sm leading-snug font-semibold ring-1 transition ${
                off
                  ? "cursor-not-allowed bg-slate-50 text-slate-400 ring-slate-200"
                  : "cursor-pointer bg-white text-slate-700 ring-slate-200 hover:ring-brand-300 has-checked:bg-brand-50 has-checked:text-brand-900 has-checked:ring-2 has-checked:ring-brand-500"
              }`}
              data-full={isFull || undefined}
            >
              <input
                type="radio"
                name={idPrefix}
                value={r}
                checked={value === r && !off}
                disabled={off}
                onChange={() => onChange(r)}
                onClick={() => !required && value === r && onChange(null)}
                required={block}
                className="size-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 flex-1 break-words">{r}</span>
              {isFull && <span className="shrink-0 rounded-lg bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">{t(lang, "vr_full")}</span>}
            </label>
          );
        })}
      </div>
      {full.some((r) => config.options.includes(r)) && <p className="mt-1.5 text-xs text-rose-700">{t(lang, "vr_fullHint")}</p>}
      {hint}
    </fieldset>
  );
}
