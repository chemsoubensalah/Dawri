"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarOff, Plus, Trash2 } from "lucide-react";
import { addDays, fmtDay } from "@/lib/domain/appointments";
import { DAYS_OFF_RANGE_MAX, dayRange } from "@/lib/domain/daysoff";
import type { DayOff, Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import type { DaysOffView } from "@/lib/server/daysoff";

/** أيّام متتالية بنفس الاسم تُعرض سطراً واحداً (إجازة من … إلى …). */
type Run = { from: string; to: string; label: string | null; booked: number; days: string[] };

function runs(items: DaysOffView["items"]): Run[] {
  const out: Run[] = [];
  for (const d of items) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d.day && last.label === d.label) {
      last.to = d.day;
      last.booked += d.booked;
      last.days.push(d.day);
    } else out.push({ from: d.day, to: d.day, label: d.label, booked: d.booked, days: [d.day] });
  }
  return out;
}

/** أيّام العطل والإجازات — قسم مستقلّ يُحفظ فور كلّ إضافة أو حذف. */
export default function DaysOffSection({ lang, slug }: { lang: Lang; slug: string }) {
  const [view, setView] = useState<DaysOffView | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<DaysOffView>(`/api/staff/${slug}/days-off`)
      .then(setView)
      .catch(() => setMsg({ ok: false, text: errorText(lang, "network") }));
  }, [slug, lang]);

  const items: DayOff[] = (view?.items ?? []).map(({ day, label }) => ({ day, label }));
  const taken = new Set(items.map((d) => d.day));
  const year = view?.today.slice(0, 4);
  const fmt = (day: string) => `${fmtDay(lang, day)}${day.slice(0, 4) !== year ? ` ${day.slice(0, 4)}` : ""}`;

  async function save(next: DayOff[]): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      setView(await api<DaysOffView>(`/api/staff/${slug}/days-off`, { items: next }));
      setMsg({ ok: true, text: t(lang, "do_saved") });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errorText(lang, (e as ApiError).code) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!from) return;
    const days = dayRange(from, to && to > from ? to : from);
    if (days.length > DAYS_OFF_RANGE_MAX) return setMsg({ ok: false, text: t(lang, "do_rangeTooLong") });
    const name = label.trim() || null;
    // الجديد أوّلاً: يغلب اسمه على اسم يوم موجود
    if (await save([...days.map((day) => ({ day, label: name })), ...items])) {
      setFrom("");
      setTo("");
      setLabel("");
    }
  }

  const missing = (view?.holidays ?? []).filter((h) => !taken.has(h.day));

  return (
    <section id="daysoff" className="card scroll-mt-28 p-6" data-testid="days-off">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <CalendarOff size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(lang, "do_title")}</h2>
          <p className="text-sm text-slate-500">{t(lang, "do_sub")}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
        <div>
          <label className="label" htmlFor="do-from">{t(lang, "do_from")}</label>
          <input
            id="do-from"
            type="date"
            dir="ltr"
            className="input num"
            min={view?.today}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (to && to < e.target.value) setTo("");
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="do-to">{t(lang, "do_to")}</label>
          <input id="do-to" type="date" dir="ltr" className="input num" min={from || view?.today} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label" htmlFor="do-label">{t(lang, "do_label")}</label>
          <input id="do-label" className="input" maxLength={60} value={label} placeholder={t(lang, "do_labelPh")} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button type="button" className="btn-primary sm:col-span-2 lg:col-span-1" disabled={busy || !view || !from} onClick={add} data-testid="do-add">
          <Plus size={16} /> {t(lang, "do_add")}
        </button>
      </div>

      {msg && <p className={`mt-2 text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">{msg.text}</p>}

      <ul className="mt-4 space-y-2">
        {view && items.length === 0 && <li className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{t(lang, "do_empty")}</li>}
        {runs(view?.items ?? []).map((r) => (
          <li key={r.from} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200" data-testid="do-item">
            <div className="flex items-center gap-3">
              <CalendarOff size={18} className="shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{r.from === r.to ? fmt(r.from) : `${fmt(r.from)} ${lang === "ar" ? "←" : "→"} ${fmt(r.to)}`}</div>
                {r.label && <div className="truncate text-sm text-slate-500">{r.label}</div>}
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                aria-label={t(lang, "do_remove")}
                title={t(lang, "do_remove")}
                disabled={busy}
                onClick={() => save(items.filter((d) => !r.days.includes(d.day)))}
              >
                <Trash2 size={17} />
              </button>
            </div>
            {r.booked > 0 && (
              <a href={`/staff/${slug}/appointments`} className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {t(lang, "do_booked", { n: r.booked })}
              </a>
            )}
          </li>
        ))}
      </ul>

      {view && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">{t(lang, "do_national")}</span>
            {missing.length > 1 && (
              <button
                type="button"
                className="ms-auto text-xs font-semibold text-brand-700 hover:underline"
                disabled={busy}
                onClick={() => save([...items, ...missing.map((h) => ({ day: h.day, label: t(lang, h.key) }))])}
              >
                + {t(lang, "do_addAll")}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {view.holidays.map((h) => (
              <button
                type="button"
                key={h.key}
                disabled={busy || taken.has(h.day)}
                onClick={() => save([...items, { day: h.day, label: t(lang, h.key) }])}
                className="rounded-xl bg-slate-50 px-3 py-1.5 text-start text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-200 disabled:opacity-40"
              >
                + {t(lang, h.key)} <span className="text-slate-400">· {fmt(h.day)}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">{t(lang, "do_religious")}</p>
        </div>
      )}
    </section>
  );
}
