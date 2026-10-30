"use client";
import { useEffect, useState } from "react";
import { ListChecks, MessageSquareText, Plus, Save, Stethoscope, UserX, X } from "lucide-react";
import ReasonPicker from "@/components/ReasonPicker";
import { REASON_CAP_MAX, REASON_OPTION_MAX, REASON_OPTIONS_MAX, type ReasonConfig, type ReasonMode } from "@/lib/domain/reasons";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import type { ReasonSettingsView } from "@/lib/server/reason-settings";

const MODES: { mode: ReasonMode; icon: React.ReactNode; title: DictKey; sub: DictKey }[] = [
  { mode: "off", icon: <UserX size={18} />, title: "vs_off", sub: "vs_offSub" },
  { mode: "list", icon: <ListChecks size={18} />, title: "vs_list", sub: "vs_listSub" },
  { mode: "text", icon: <MessageSquareText size={18} />, title: "vs_text", sub: "vs_textSub" },
];

/** «سبب الزيارة»: الطبيب يختار ألّا يسأل، أو يكتب اختياراته، أو يترك المريض يكتب — قسم مستقلّ بحفظه الخاصّ. */
export default function VisitReasonSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [cfg, setCfg] = useState<ReasonConfig | null>(null);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<ReasonSettingsView>(`/api/staff/${slug}/reason`)
      .then((v) => {
        setCfg(v.config);
        setSuggestions(v.suggestions);
      })
      .catch((e) => setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) }));
  }, [slug, lang]);

  if (!cfg) return <section id="reason" className="card scroll-mt-28 p-6" aria-busy="true" />;

  const set = (patch: Partial<ReasonConfig>) => {
    setCfg({ ...cfg, ...patch });
    setMsg(null);
    setPreview(null);
  };
  const addOption = (text: string) => {
    const s = text.replace(/\s+/g, " ").trim().slice(0, REASON_OPTION_MAX);
    if (!s || cfg.options.includes(s) || cfg.options.length >= REASON_OPTIONS_MAX) return;
    set({ options: [...cfg.options, s] });
    setDraft("");
  };
  const removeOption = (o: string) => {
    const { [o]: _, ...caps } = cfg.caps;
    set({ options: cfg.options.filter((x) => x !== o), caps });
  };
  /** الحدّ اليوميّ لاختيار: فارغ = بلا حدّ (القيمة تبقى صالحة دائماً: الحقل داخل نموذج الإعدادات) */
  const setCap = (o: string, v: string) => {
    const n = Math.min(Number.parseInt(v, 10), REASON_CAP_MAX);
    const { [o]: _, ...caps } = cfg.caps;
    set({ caps: n >= 1 ? { ...caps, [o]: n } : caps });
  };
  const noOptions = cfg.mode === "list" && cfg.options.length === 0;

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<ReasonSettingsView>(`/api/staff/${slug}/reason`, cfg);
      setCfg(r.config);
      // قسم «حدود التسجيل» يعرض الحدود اليومية
      window.dispatchEvent(new CustomEvent("dawri:reason-saved", { detail: r.config }));
      setMsg({ ok: true, text: t(lang, "vs_saved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="reason" className="card scroll-mt-28 p-6" data-testid="reason-settings">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Stethoscope size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "vs_title")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "vs_sub")}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t(lang, "vs_title")}>
        {MODES.map((m) => (
          <label
            key={m.mode}
            className="flex cursor-pointer gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200 transition hover:ring-brand-300 has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-500"
          >
            <input type="radio" name="reason-mode" className="mt-1 size-4 shrink-0 accent-brand-600" checked={cfg.mode === m.mode} onChange={() => set({ mode: m.mode })} />
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-ink">
                <span className="text-brand-700">{m.icon}</span> {t(lang, m.title)}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t(lang, m.sub)}</span>
            </span>
          </label>
        ))}
      </div>

      {cfg.mode === "list" && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
          <div className="label">{t(lang, "vs_options")}</div>
          {cfg.options.length > 0 ? (
            <>
              <ul className="mb-2 space-y-2" data-testid="reason-options">
                {cfg.options.map((o) => (
                  <li key={o} className="flex items-center gap-2 rounded-xl bg-white py-1.5 ps-3 pe-1.5 text-sm font-semibold ring-1 ring-slate-200">
                    <span className="min-w-0 flex-1 break-words">{o}</span>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs font-normal text-slate-500">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={REASON_CAP_MAX}
                        className="input num w-24 py-1.5 text-center text-sm"
                        placeholder={t(lang, "vs_capPh")}
                        value={cfg.caps[o] ?? ""}
                        onChange={(e) => setCap(o, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                        aria-label={`${o} — ${t(lang, "vs_capLabel")}`}
                        data-testid="reason-cap"
                      />
                      {t(lang, "vs_capLabel")}
                    </label>
                    <button type="button" className="rounded-lg p-1 text-rose-500 hover:bg-rose-50" aria-label={`× ${o}`} onClick={() => removeOption(o)}>
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">{t(lang, "vs_capHint")}</p>
            </>
          ) : (
            <p className="mb-3 text-sm font-semibold text-amber-700">{t(lang, "vs_noOptions")}</p>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={draft}
              maxLength={REASON_OPTION_MAX}
              placeholder={t(lang, "vs_optionPh")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption(draft);
                }
              }}
              disabled={cfg.options.length >= REASON_OPTIONS_MAX}
              data-testid="reason-option-input"
            />
            <button type="button" className="btn-secondary shrink-0" onClick={() => addOption(draft)} disabled={!draft.trim() || cfg.options.length >= REASON_OPTIONS_MAX}>
              <Plus size={16} /> {t(lang, "vs_addOption")}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-500">{t(lang, "vs_suggest")}</div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((k) => {
                  const text = t(lang, `vr_${k}` as DictKey);
                  return (
                    <button
                      type="button"
                      key={k}
                      disabled={cfg.options.includes(text) || cfg.options.length >= REASON_OPTIONS_MAX}
                      onClick={() => addOption(text)}
                      className="rounded-xl bg-white px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-200 disabled:opacity-40"
                    >
                      + {text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {cfg.mode !== "off" && (
        <>
          <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
            <input type="checkbox" className="size-5 accent-brand-600" checked={cfg.required} onChange={(e) => set({ required: e.target.checked })} />
            {t(lang, "vs_required")}
          </label>
          {cfg.mode === "text" && <p className="mt-2 text-xs text-slate-500">{t(lang, "vs_textNote")}</p>}
          {!noOptions && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="mb-2 text-xs font-semibold text-slate-500">{t(lang, "vs_preview")}</div>
              <ReasonPicker lang={lang} config={cfg} value={preview} onChange={setPreview} required={cfg.required} idPrefix="reason-preview" preview />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex items-center gap-3">
        {/* في البداية لا الطرف: زرّ «حفظ» العامّ للإعدادات يطفو في الطرف الآخر */}
        <button type="button" className="btn-primary btn-sm" disabled={busy || noOptions} onClick={save} data-testid="reason-save">
          <Save size={15} /> {t(lang, "vs_save")}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
