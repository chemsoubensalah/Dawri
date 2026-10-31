"use client";
import { useEffect, useState } from "react";
import { Printer, Save } from "lucide-react";
import type { PaperWidth, PrintConfig, PrintLang, TextSize } from "@/lib/domain/printing";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import { printReceipt } from "@/lib/print";
import type { PrintSettingsView } from "@/lib/server/print-settings";

const PAPERS: { paper: PaperWidth; title: DictKey; sub: DictKey }[] = [
  { paper: 80, title: "ps_paper80", sub: "ps_paper80Sub" },
  { paper: 58, title: "ps_paper58", sub: "ps_paper58Sub" },
];
const LANGS: { lang: PrintLang; title: DictKey }[] = [
  { lang: "auto", title: "ps_langAuto" },
  { lang: "ar", title: "ps_langAr" },
  { lang: "fr", title: "ps_langFr" },
  { lang: "both", title: "ps_langBoth" },
];
const SIZES: { size: TextSize; title: DictKey }[] = [
  { size: "s", title: "ps_s" },
  { size: "m", title: "ps_m" },
  { size: "l", title: "ps_l" },
];

/** «طباعة التذاكر»: عرض الورق، حجم الكتابة، رمز QR — مع معاينة حيّة وطباعة تجريبية قبل الحفظ. */
export default function PrintSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [cfg, setCfg] = useState<PrintConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<PrintSettingsView>(`/api/staff/${slug}/print-settings`)
      .then((v) => setCfg(v.config))
      .catch((e) => setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) }));
  }, [slug, lang]);

  if (!cfg) return <section id="printing" className="card scroll-mt-28 p-6" aria-busy="true" />;

  const set = (patch: Partial<PrintConfig>) => {
    setCfg({ ...cfg, ...patch });
    setMsg(null);
  };
  // تذكرة تجريبية بالإعداد المعروض (قبل حفظه)
  const sampleUrl = (preview: boolean) =>
    `/staff/${encodeURIComponent(slug)}/print?sample=1&p=${cfg.paper}&s=${cfg.size}&qr=${cfg.qr ? 1 : 0}&l=${cfg.lang}${preview ? "&preview=1" : ""}`;

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<PrintSettingsView>(`/api/staff/${slug}/print-settings`, cfg);
      setCfg(r.config);
      setMsg({ ok: true, text: t(lang, "ps_saved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="printing" className="card scroll-mt-28 p-6" data-testid="print-settings">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Printer size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "ps_title")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "ps_sub")}</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <div className="label">{t(lang, "ps_paper")}</div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t(lang, "ps_paper")}>
              {PAPERS.map((p) => (
                <label
                  key={p.paper}
                  className="flex cursor-pointer gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200 transition hover:ring-brand-300 has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-500"
                >
                  <input
                    type="radio"
                    name="print-paper"
                    className="mt-1 size-4 shrink-0 accent-brand-600"
                    checked={cfg.paper === p.paper}
                    onChange={() => set({ paper: p.paper })}
                    data-testid={`print-paper-${p.paper}`}
                  />
                  <span>
                    <span className="num block font-semibold text-ink">{t(lang, p.title)}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t(lang, p.sub)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="label">{t(lang, "ps_size")}</div>
            <div className="inline-flex rounded-2xl bg-slate-100 p-1" role="radiogroup" aria-label={t(lang, "ps_size")}>
              {SIZES.map((x, i) => (
                <label
                  key={x.size}
                  className="cursor-pointer rounded-xl px-4 py-2 font-semibold text-slate-600 transition has-checked:bg-white has-checked:text-brand-800 has-checked:shadow-sm"
                  style={{ fontSize: `${0.8 + i * 0.12}rem` }}
                >
                  <input type="radio" name="print-size" className="sr-only" checked={cfg.size === x.size} onChange={() => set({ size: x.size })} data-testid={`print-size-${x.size}`} />
                  {t(lang, x.title)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="label">{t(lang, "ps_lang")}</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t(lang, "ps_lang")}>
              {LANGS.map((x) => (
                <label
                  key={x.lang}
                  className="cursor-pointer rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:ring-brand-300 has-checked:bg-brand-50 has-checked:text-brand-800 has-checked:ring-2 has-checked:ring-brand-500"
                >
                  <input type="radio" name="print-lang" className="sr-only" checked={cfg.lang === x.lang} onChange={() => set({ lang: x.lang })} data-testid={`print-lang-${x.lang}`} />
                  {t(lang, x.title)}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
            <input type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={cfg.qr} onChange={(e) => set({ qr: e.target.checked })} data-testid="print-qr" />
            {t(lang, "ps_qr")}
          </label>
          <p className="text-xs leading-relaxed text-slate-500">{t(lang, "ps_hint")}</p>

          <div className="flex flex-wrap items-center gap-3">
            {/* في البداية لا الطرف: زرّ «حفظ» العامّ للإعدادات يطفو في الطرف الآخر */}
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={save} data-testid="print-save">
              <Save size={15} /> {t(lang, "ps_save")}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => printReceipt(sampleUrl(false))} data-testid="print-test">
              <Printer size={15} /> {t(lang, "ps_test")}
            </button>
          </div>
          {msg && (
            <p className={`text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">
              {msg.text}
            </p>
          )}
        </div>

        <div>
          <div className="label">{t(lang, "ps_preview")}</div>
          {/* معاينة بالمقاس الحقيقي (مم) — تتغيّر فور تغيير الاختيار */}
          <iframe
            key={sampleUrl(true)}
            src={sampleUrl(true)}
            title={t(lang, "ps_preview")}
            className="h-[30rem] w-full rounded-2xl bg-slate-100 ring-1 ring-slate-200 md:w-[20rem]"
            data-testid="print-preview"
          />
        </div>
      </div>
    </section>
  );
}
