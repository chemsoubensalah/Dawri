"use client";
import { useState } from "react";
import LangSwitch from "@/components/LangSwitch";
import type { Interval, Lang, ShopSettings, WeeklyHours } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

// نبدأ الأسبوع بالسبت كما في الجزائر
const DAYS = ["6", "0", "1", "2", "3", "4", "5"];
const FIELDS: (keyof ShopSettings)[] = [
  "confirmAhead",
  "confirmTimeoutMin",
  "notifyAhead",
  "callGraceMin",
  "lateWindowMin",
  "noShowLimit",
  "defaultServiceMin",
];

export default function SettingsForm({
  lang,
  slug,
  initial,
}: {
  lang: Lang;
  slug: string;
  initial: { name: string; hours: WeeklyHours; settings: ShopSettings; defaultLang: Lang };
}) {
  const [name, setName] = useState(initial.name);
  const [hours, setHours] = useState<WeeklyHours>(initial.hours);
  const [settings, setSettings] = useState(initial.settings);
  const [defaultLang, setDefaultLang] = useState(initial.defaultLang);
  const [newPin, setNewPin] = useState("");
  const [rotateDoor, setRotateDoor] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setDay = (d: string, v: Interval[]) => setHours((h) => ({ ...h, [d]: v }));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <a href={`/staff/${slug}`} className="font-semibold text-brand-700 underline">← {initial.name}</a>
        <LangSwitch lang={lang} />
      </header>
      <h1 className="text-2xl font-extrabold">{t(lang, "settings")}</h1>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            await api(`/api/staff/${slug}/settings`, {
              name,
              hours,
              settings,
              lang: defaultLang,
              newPin: newPin || undefined,
              rotateDoor,
            });
            setMsg({ ok: true, text: t(lang, "saved") });
            setNewPin("");
            setRotateDoor(false);
          } catch (err) {
            setMsg({ ok: false, text: errorText(lang, (err as ApiError).code) });
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="card space-y-3">
          <label className="label" htmlFor="name">{t(lang, "shopName")}</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="label">{t(lang, "defaultLang")}</label>
          <div className="flex gap-2">
            {(["ar", "fr"] as Lang[]).map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setDefaultLang(l)}
                className={`rounded-xl px-4 py-2 font-semibold ring-1 ${defaultLang === l ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300"}`}
              >
                {l === "ar" ? "العربية" : "Français"}
              </button>
            ))}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-extrabold">{t(lang, "hours")}</h2>
          {DAYS.map((d) => {
            const list = hours[d] ?? [];
            return (
              <div key={d} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
                <span className="w-24 font-semibold">{t(lang, `weekday_${d}` as DictKey)}</span>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={list.length === 0}
                    onChange={(e) => setDay(d, e.target.checked ? [] : [["06:00", "16:00"]])}
                  />
                  {t(lang, "closed")}
                </label>
                {list.map(([a, b], i) => (
                  <span key={i} className="flex items-center gap-1" dir="ltr">
                    <input
                      type="time"
                      className="rounded-lg border border-slate-300 px-2 py-1"
                      value={a}
                      onChange={(e) => setDay(d, list.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))}
                    />
                    –
                    <input
                      type="time"
                      className="rounded-lg border border-slate-300 px-2 py-1"
                      value={b}
                      onChange={(e) => setDay(d, list.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
                    />
                    {i > 0 && (
                      <button type="button" className="px-2 text-red-600" onClick={() => setDay(d, list.filter((_, j) => j !== i))}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {list.length === 1 && (
                  <button type="button" className="text-sm text-brand-700 underline" onClick={() => setDay(d, [...list, ["14:00", "18:00"]])}>
                    +
                  </button>
                )}
              </div>
            );
          })}
        </section>

        <section className="card space-y-3">
          {FIELDS.map((f) => (
            <div key={f} className="flex items-center justify-between gap-3">
              <label className="text-slate-700" htmlFor={f}>{t(lang, `s_${f}` as DictKey)}</label>
              <input
                id={f}
                type="number"
                className="num w-20 rounded-lg border border-slate-300 px-2 py-1 text-center"
                value={settings[f]}
                min={0}
                onChange={(e) => setSettings((s) => ({ ...s, [f]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </section>

        <section className="card space-y-3">
          <label className="label" htmlFor="pin">{t(lang, "newPin")}</label>
          <input
            id="pin"
            className="input num"
            dir="ltr"
            inputMode="numeric"
            maxLength={8}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-5" checked={rotateDoor} onChange={(e) => setRotateDoor(e.target.checked)} />
            {t(lang, "rotateDoor")}
          </label>
        </section>

        {msg && <p className={`text-center font-semibold ${msg.ok ? "text-brand-700" : "text-red-700"}`}>{msg.text}</p>}
        <button className="btn-primary w-full" disabled={busy}>{t(lang, "save")}</button>
      </form>
    </main>
  );
}
