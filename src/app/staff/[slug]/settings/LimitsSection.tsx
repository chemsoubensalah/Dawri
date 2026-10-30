"use client";
import { useEffect, useState } from "react";
import { Gauge, PhoneOff, Save, UserCog } from "lucide-react";
import { PHONE_DAYS_MAX, type LimitsConfig, type PhoneScope } from "@/lib/domain/limits";
import type { ReasonConfig } from "@/lib/domain/reasons";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import type { LimitsSettingsView } from "@/lib/server/limits";
import type { ReasonSettingsView } from "@/lib/server/reason-settings";

const SCOPES: { scope: PhoneScope; title: DictKey; sub: DictKey }[] = [
  { scope: "appts", title: "lm_scopeAppts", sub: "lm_scopeApptsSub" },
  { scope: "all", title: "lm_scopeAll", sub: "lm_scopeAllSub" },
];

/**
 * «حدود التسجيل»: ملخّص الحدّ اليوميّ لكلّ حالة (يُكتب في «سبب الزيارة»)،
 * ومهلة الهاتف ونطاقها، وتجاوز السكرتيرة — قسم مستقلّ بحفظه الخاصّ.
 */
export default function LimitsSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [cfg, setCfg] = useState<LimitsConfig | null>(null);
  const [reason, setReason] = useState<ReasonConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<LimitsSettingsView>(`/api/staff/${slug}/limits`)
      .then((v) => setCfg(v.config))
      .catch((e) => setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) }));
    api<ReasonSettingsView>(`/api/staff/${slug}/reason`)
      .then((v) => setReason(v.config))
      .catch(() => {});
    const onSaved = (e: Event) => setReason((e as CustomEvent<ReasonConfig>).detail);
    window.addEventListener("dawri:reason-saved", onSaved);
    return () => window.removeEventListener("dawri:reason-saved", onSaved);
  }, [slug, lang]);

  if (!cfg) return <section id="limits" className="card scroll-mt-28 p-6" aria-busy="true" />;

  const set = (patch: Partial<LimitsConfig>) => {
    setCfg({ ...cfg, ...patch });
    setMsg(null);
  };

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<LimitsSettingsView>(`/api/staff/${slug}/limits`, cfg);
      setCfg(r.config);
      setMsg({ ok: true, text: t(lang, "lm_saved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  }

  const caps = reason?.mode === "list" ? reason.options.filter((o) => reason.caps[o]).map((o) => [o, reason.caps[o]] as const) : [];

  return (
    <section id="limits" className="card scroll-mt-28 p-6" data-testid="limits-settings">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Gauge size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "lm_title")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "lm_sub")}</p>
        </div>
      </div>

      {/* ——— الحدّ اليوميّ لكلّ حالة (يُكتب في «سبب الزيارة») ——— */}
      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
        <div className="font-semibold text-ink">{t(lang, "lm_capsTitle")}</div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{t(lang, reason && reason.mode !== "list" ? "lm_capsNeedList" : "lm_capsHint")}</p>
        {caps.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" data-testid="limits-caps">
            {caps.map(([o, n]) => (
              <li key={o} className="rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200">
                <span className="font-semibold">{o}</span> <span className="num text-slate-500">· {t(lang, "lm_capN", { n })}</span>
              </li>
            ))}
          </ul>
        ) : (
          reason?.mode === "list" && <p className="mt-3 text-sm text-slate-500">{t(lang, "lm_capsNone")}</p>
        )}
        <a href="#reason" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
          {t(lang, "lm_capsEdit")} {lang === "ar" ? "←" : "→"}
        </a>
      </div>

      {/* ——— مهلة الهاتف ——— */}
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
        <label className="flex items-center gap-1.5 font-semibold text-ink" htmlFor="limits-days">
          <PhoneOff size={16} className="text-brand-700" /> {t(lang, "lm_phoneTitle")}
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="limits-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={PHONE_DAYS_MAX}
            className="input num w-24 text-center"
            value={cfg.phoneDays}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              set({ phoneDays: Number.isFinite(n) ? Math.max(0, Math.min(n, PHONE_DAYS_MAX)) : 0 });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            data-testid="limits-days"
          />
          <span className="text-sm text-slate-600">{t(lang, "lm_phoneDays")}</span>
          <span className="text-xs text-slate-400">{t(lang, "lm_phoneOff")}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{t(lang, "lm_phoneHint")}</p>
        {cfg.phoneDays > 0 && (
          <>
            <div className="mt-3 mb-2 text-xs font-semibold text-slate-500">{t(lang, "lm_scopeTitle")}</div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t(lang, "lm_scopeTitle")}>
              {SCOPES.map((s) => (
                <label
                  key={s.scope}
                  className="flex cursor-pointer gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200 transition hover:ring-brand-300 has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-500"
                >
                  <input
                    type="radio"
                    name="limits-scope"
                    className="mt-1 size-4 shrink-0 accent-brand-600"
                    checked={cfg.phoneScope === s.scope}
                    onChange={() => set({ phoneScope: s.scope })}
                    data-testid={`limits-scope-${s.scope}`}
                  />
                  <span>
                    <span className="block font-semibold text-ink">{t(lang, s.title)}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t(lang, s.sub)}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ——— السكرتيرة ——— */}
      <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={cfg.staffOverride} onChange={(e) => set({ staffOverride: e.target.checked })} data-testid="limits-override" />
        <UserCog size={18} className="shrink-0 text-brand-700" />
        {t(lang, "lm_staffOverride")}
      </label>
      <p className="mt-2 text-xs text-slate-500">{t(lang, "lm_patientsNote")}</p>

      <div className="mt-4 flex items-center gap-3">
        {/* في البداية لا الطرف: زرّ «حفظ» العامّ للإعدادات يطفو في الطرف الآخر */}
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={save} data-testid="limits-save">
          <Save size={15} /> {t(lang, "lm_save")}
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
