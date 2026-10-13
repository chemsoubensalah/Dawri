"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { BOOKING_LIMITS, daySlots, type BookingNumberKey, type BookingSettings } from "@/lib/domain/appointments";
import type { Interval, Lang, WeeklyHours } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import type { BookingSettingsView } from "@/lib/server/appointments";

// نبدأ الأسبوع بالسبت كما في الجزائر
const DAYS = ["6", "0", "1", "2", "3", "4", "5"];
const SLOT_CHOICES = [10, 15, 20, 30, 45, 60];
const FIELDS: BookingNumberKey[] = ["perSlot", "daysAhead", "minLeadMin", "dailyMax", "arrivalGraceMin"];
/** حقول هذا القسم خارج نموذج الإعدادات الكبير: لا يتحقّق منها ولا يرسلها زرّ «حفظ» العامّ. */
const FORM = "ap-booking-form";

/** يوم أسبوع مرجعي (لأيّ تاريخ يقع في ذلك اليوم) لمعاينة الشبكة. */
function sampleDay(weekday: string): string {
  const base = new Date(Date.UTC(2026, 0, 4, 12)); // الأحد
  base.setUTCDate(base.getUTCDate() + Number(weekday));
  return base.toISOString().slice(0, 10);
}

/** إعدادات المواعيد — قسم مستقلّ (حالته، وواجهته GET/POST، وزرّ حفظه). */
export default function BookingSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [view, setView] = useState<BookingSettingsView | null>(null);
  const [s, setS] = useState<BookingSettings | null>(null);
  const [custom, setCustom] = useState(false);
  const [hours, setHours] = useState<WeeklyHours>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = (v: BookingSettingsView) => {
    setView(v);
    setS(v.settings);
    setCustom(v.settings.hours !== null);
    setHours(v.settings.hours ?? v.shopHours);
  };

  useEffect(() => {
    api<BookingSettingsView>(`/api/staff/${slug}/booking`)
      .then(load)
      .catch((e) => setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) }));
  }, [slug, lang]);

  const effective = custom ? hours : (view?.shopHours ?? {});
  const preview = useMemo(() => {
    if (!s) return null;
    for (const d of DAYS) {
      const slots = daySlots(effective, sampleDay(d), s.slotMin);
      if (slots.length) {
        // الحقل قد يكون فارغاً لحظة الكتابة
        const cap = slots.length * (Number.isFinite(s.perSlot) && s.perSlot > 0 ? s.perSlot : 1);
        return { day: d, first: slots[0], last: slots[slots.length - 1], n: s.dailyMax > 0 ? Math.min(cap, s.dailyMax) : cap };
      }
    }
    return null;
  }, [s, effective]);

  if (!s || !view) {
    return (
      <section id="booking" className="card flex scroll-mt-28 items-center justify-center p-10 text-slate-400">
        {msg ? <p className="text-sm font-semibold text-rose-700">{msg.text}</p> : <Loader2 size={22} className="animate-spin" />}
      </section>
    );
  }

  const set = (k: keyof BookingSettings, v: unknown) => setS((x) => (x ? { ...x, [k]: v } : x));
  const setDay = (d: string, v: Interval[]) => setHours((h) => ({ ...h, [d]: v }));
  const copyToAll = (d: string) =>
    setHours((h) => Object.fromEntries(DAYS.map((x) => [x, x === "5" ? (h[x] ?? []) : (h[d] ?? []).map((iv) => [...iv] as Interval)])));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<BookingSettingsView>(`/api/staff/${slug}/booking`, {
        enabled: s.enabled,
        slotMin: s.slotMin,
        perSlot: s.perSlot,
        daysAhead: s.daysAhead,
        minLeadMin: s.minLeadMin,
        dailyMax: s.dailyMax,
        arrivalGraceMin: s.arrivalGraceMin,
        hours: custom ? hours : null,
      });
      load(r);
      setMsg({ ok: true, text: t(lang, "saved") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
    } finally {
      setBusy(false);
    }
  };

  const bookingUrl = typeof window === "undefined" ? `/s/${slug}/book` : `${location.origin}/s/${slug}/book`;
  const numberInput = (k: BookingNumberKey, id: string) => (
    <input
      id={id}
      form={FORM}
      type="number"
      inputMode="numeric"
      className="num w-20 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center font-semibold"
      value={Number.isFinite(s[k]) ? s[k] : ""}
      min={BOOKING_LIMITS[k][0]}
      max={BOOKING_LIMITS[k][1]}
      onChange={(e) => set(k, e.target.value === "" ? NaN : Number(e.target.value))}
    />
  );

  return (
    <section
      id="booking"
      className="card scroll-mt-28 p-6"
      data-testid="booking-section"
      onKeyDown={(e) => {
        // Enter في حقول هذا القسم يحفظ المواعيد (لا إعدادات الصفحة كلّها)
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <CalendarClock size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "ap_se_title")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "ap_se_sub")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3.5">
        <div>
          <div className="font-semibold">{t(lang, "ap_se_enable")}</div>
          <div className="text-xs leading-relaxed text-slate-500">{t(lang, "ap_se_enableHint")}</div>
        </div>
        <button
          type="button"
          form={FORM}
          role="switch"
          aria-checked={s.enabled}
          aria-label={t(lang, "ap_se_enable")}
          onClick={() => set("enabled", !s.enabled)}
          data-testid="booking-toggle"
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${s.enabled ? "bg-brand-500" : "bg-slate-300"}`}
        >
          <span className={`absolute size-6 rounded-full bg-white shadow transition-all ${s.enabled ? "ltr:left-[22px] rtl:right-[22px]" : "ltr:left-0.5 rtl:right-0.5"}`} />
        </button>
      </div>

      {s.enabled && view.verify === "unavailable" && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {t(lang, "ap_se_smsWarn")}
        </p>
      )}
      {s.enabled && !view.active && (
        <p className="mt-3 rounded-2xl bg-rose-50 p-3.5 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">{t(lang, "ap_se_inactive")}</p>
      )}

      <div className="mt-5">
        <div className="label">{t(lang, "ap_se_slotMin")}</div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t(lang, "ap_se_slotMin")}>
          {[...new Set([...SLOT_CHOICES, s.slotMin].filter((x) => Number.isFinite(x)))]
            .sort((a, b) => a - b)
            .map((m) => {
              const on = s.slotMin === m;
              return (
                <button
                  type="button"
                  form={FORM}
                  key={m}
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("slotMin", m)}
                  className={`num inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                    on ? "bg-ink text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
                  }`}
                >
                  {on && <Check size={14} />} {t(lang, "sp_min", { n: m })}
                </button>
              );
            })}
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {FIELDS.map((f) => (
          <div key={f} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
            <label className="text-sm text-slate-700" htmlFor={`ap-${f}`}>{t(lang, `ap_se_${f}` as DictKey)}</label>
            {numberInput(f, `ap-${f}`)}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="label">{t(lang, "ap_se_hours")}</div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t(lang, "ap_se_hours")}>
          {([false, true] as const).map((c) => (
            <button
              type="button"
              form={FORM}
              key={String(c)}
              role="radio"
              aria-checked={custom === c}
              onClick={() => {
                setCustom(c);
                if (c && !custom) setHours(s.hours ?? view.shopHours);
              }}
              className={`flex items-center gap-2.5 rounded-2xl p-3.5 text-start text-sm font-semibold transition ${
                custom === c ? "bg-white shadow-(--shadow-brand) ring-2 ring-brand-500" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${custom === c ? "bg-brand-600 text-white" : "ring-1 ring-slate-300"}`}>
                {custom === c && <Check size={13} strokeWidth={3} />}
              </span>
              {t(lang, c ? "ap_se_customHours" : "ap_se_sameHours")}
            </button>
          ))}
        </div>

        {custom && (
          <div className="mt-3 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200/70">
            {DAYS.map((d) => {
              const list = hours[d] ?? [];
              const open = list.length > 0;
              return (
                <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <label className="flex w-28 items-center gap-2.5 text-sm font-semibold">
                    <input
                      type="checkbox"
                      form={FORM}
                      className="size-5 accent-brand-600"
                      checked={open}
                      onChange={(e) => setDay(d, e.target.checked ? [["08:00", "12:00"]] : [])}
                    />
                    {t(lang, `weekday_${d}` as DictKey)}
                  </label>
                  {!open && <span className="text-sm text-slate-400">{t(lang, "closed")}</span>}
                  {list.map(([a, b], i) => (
                    <span key={i} className="flex items-center gap-1.5" dir="ltr">
                      <input type="time" form={FORM} className="num rounded-xl border border-slate-200 px-2 py-1.5" value={a} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                      <span className="text-slate-400">–</span>
                      <input type="time" form={FORM} className="num rounded-xl border border-slate-200 px-2 py-1.5" value={b} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                      {i > 0 && (
                        <button type="button" form={FORM} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" onClick={() => setDay(d, list.filter((_, j) => j !== i))} aria-label="×">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </span>
                  ))}
                  <span className="ms-auto flex gap-1">
                    {list.length === 1 && (
                      <button type="button" form={FORM} className="btn-ghost btn-sm" onClick={() => setDay(d, [...list, ["14:00", "17:00"]])}>
                        <Plus size={15} /> {t(lang, "se_addPeriod")}
                      </button>
                    )}
                    {open && (
                      <button type="button" form={FORM} className="btn-ghost btn-sm text-slate-500" onClick={() => copyToAll(d)}>
                        {t(lang, "se_copyAll")}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-50/70 px-3.5 py-2.5 text-sm text-brand-900" data-testid="booking-preview">
          <CalendarClock size={16} className="shrink-0 text-brand-600" />
          {preview ? (
            <span>
              {t(lang, "ap_se_preview", { day: t(lang, `weekday_${preview.day}` as DictKey), first: preview.first, last: preview.last, n: preview.n })}
            </span>
          ) : (
            <span>{t(lang, "ap_se_previewNone")}</span>
          )}
        </p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">{t(lang, "ap_se_rules")}</p>

      {s.enabled && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 p-2 ps-3 ring-1 ring-slate-200" dir="ltr">
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{bookingUrl.replace(/^https?:\/\//, "")}</span>
          <button
            type="button"
            form={FORM}
            className="btn-secondary btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(bookingUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            <Copy size={14} /> {copied ? "✓" : t(lang, "db_copy")}
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {msg && (
          <p className={`me-auto text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">
            {msg.text}
          </p>
        )}
        <button type="button" form={FORM} className="btn-primary" onClick={save} disabled={busy} data-testid="booking-save">
          <Save size={18} /> {busy ? "…" : t(lang, "ap_se_save")}
        </button>
      </div>
    </section>
  );
}
