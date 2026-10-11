"use client";
import { useState } from "react";
import { BellRing, Building2, CheckCircle2, Clock3, KeyRound, ListChecks, MessageCircle, Plus, Save, Smartphone, Trash2, XCircle } from "lucide-react";
import type { Interval, Lang, ShopProfile, ShopSettings, WeeklyHours } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import type { ChannelStatus } from "@/lib/server/channels";

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

function Section({ id, icon, title, sub, children }: { id: string; icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-28 p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {sub && <p className="text-sm text-slate-500">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsForm({
  lang,
  slug,
  channels,
  initial,
}: {
  lang: Lang;
  slug: string;
  channels: ChannelStatus;
  initial: { name: string; hours: WeeklyHours; settings: ShopSettings; defaultLang: Lang; profile: ShopProfile };
}) {
  const [name, setName] = useState(initial.name);
  const [profile, setProfile] = useState<ShopProfile>(initial.profile);
  const [hours, setHours] = useState<WeeklyHours>(initial.hours);
  const [settings, setSettings] = useState(initial.settings);
  const [defaultLang, setDefaultLang] = useState(initial.defaultLang);
  const [newPin, setNewPin] = useState("");
  const [rotateDoor, setRotateDoor] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setDay = (d: string, v: Interval[]) => setHours((h) => ({ ...h, [d]: v }));
  const setP = (k: keyof ShopProfile, v: string) => setProfile((p) => ({ ...p, [k]: v || null }));
  // نسخ ساعات يوم إلى كلّ الأيّام (الجمعة تبقى كما هي)
  const copyToAll = (d: string) =>
    setHours((h) => Object.fromEntries(DAYS.map((x) => [x, x === "5" ? (h[x] ?? []) : (h[d] ?? []).map((iv) => [...iv] as Interval)])));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/staff/${slug}/settings`, {
        name,
        profile,
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
  };

  const channel = (on: boolean, label: string, hint: string, testOnly = false) => (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200/70">
      {on ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand-600" /> : <XCircle size={20} className="mt-0.5 shrink-0 text-slate-300" />}
      <div>
        <div className="font-semibold">
          {label} {testOnly && <span className="text-xs font-normal text-amber-700">({t(lang, "se_testMode")})</span>}
        </div>
        <div className="text-sm text-slate-500">{hint}</div>
      </div>
    </div>
  );

  return (
    <form
      className="grid gap-5 lg:grid-cols-[220px_1fr]"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <nav className="hidden lg:block">
        <div className="sticky top-32 space-y-1">
          {(
            [
              ["profile", "se_profile"],
              ["hours", "hours"],
              ["rules", "se_rules"],
              ["alerts", "se_alerts"],
              ["security", "se_security"],
            ] as [string, DictKey][]
          ).map(([id, k]) => (
            <a key={id} href={`#${id}`} className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-ink">
              {t(lang, k)}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-5">
        <Section id="profile" icon={<Building2 size={20} />} title={t(lang, "se_profile")} sub={t(lang, "se_profileSub")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">{t(lang, "shopName")}</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="doctor">{t(lang, "st_doctorName")}</label>
              <input id="doctor" className="input" value={profile.doctorName ?? ""} onChange={(e) => setP("doctorName", e.target.value)} maxLength={80} placeholder={t(lang, "nw_doctorPh")} />
            </div>
            <div>
              <label className="label" htmlFor="spec">{t(lang, "se_specialty")}</label>
              <input id="spec" className="input" value={profile.specialty ?? ""} onChange={(e) => setP("specialty", e.target.value)} maxLength={80} placeholder={t(lang, "se_specialtyPh")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="addr">{t(lang, "se_address")}</label>
              <input id="addr" className="input" value={profile.address ?? ""} onChange={(e) => setP("address", e.target.value)} maxLength={160} placeholder={t(lang, "se_addressPh")} />
            </div>
            <div>
              <label className="label" htmlFor="tel">{t(lang, "se_phone")}</label>
              <input id="tel" className="input num text-start" dir="ltr" type="tel" value={profile.phone ?? ""} onChange={(e) => setP("phone", e.target.value)} maxLength={20} placeholder="023 00 00 00" />
            </div>
            <div>
              <label className="label" htmlFor="maps">{t(lang, "se_maps")}</label>
              <input id="maps" className="input text-start" dir="ltr" type="url" value={profile.mapsUrl ?? ""} onChange={(e) => setP("mapsUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t(lang, "defaultLang")}</label>
              <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                {(["ar", "fr"] as Lang[]).map((l) => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => setDefaultLang(l)}
                    className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${defaultLang === l ? "bg-white text-ink shadow-sm" : "text-slate-500"}`}
                  >
                    {l === "ar" ? "العربية" : "Français"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section id="hours" icon={<Clock3 size={20} />} title={t(lang, "hours")} sub={t(lang, "se_hoursSub")}>
          <div className="divide-y divide-slate-100">
            {DAYS.map((d) => {
              const list = hours[d] ?? [];
              const open = list.length > 0;
              return (
                <div key={d} className="flex flex-wrap items-center gap-3 py-3">
                  <label className="flex w-32 items-center gap-2.5 font-semibold">
                    <input
                      type="checkbox"
                      className="size-5 accent-brand-600"
                      checked={open}
                      onChange={(e) => setDay(d, e.target.checked ? [["06:00", "16:00"]] : [])}
                    />
                    {t(lang, `weekday_${d}` as DictKey)}
                  </label>
                  {!open && <span className="text-sm text-slate-400">{t(lang, "closed")}</span>}
                  {list.map(([a, b], i) => (
                    <span key={i} className="flex items-center gap-1.5" dir="ltr">
                      <input type="time" className="num rounded-xl border border-slate-200 px-2.5 py-1.5" value={a} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                      <span className="text-slate-400">–</span>
                      <input type="time" className="num rounded-xl border border-slate-200 px-2.5 py-1.5" value={b} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                      {i > 0 && (
                        <button type="button" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" onClick={() => setDay(d, list.filter((_, j) => j !== i))} aria-label="×">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </span>
                  ))}
                  <span className="ms-auto flex gap-1">
                    {list.length === 1 && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setDay(d, [...list, ["14:00", "18:00"]])}>
                        <Plus size={15} /> {t(lang, "se_addPeriod")}
                      </button>
                    )}
                    {open && (
                      <button type="button" className="btn-ghost btn-sm text-slate-500" onClick={() => copyToAll(d)}>
                        {t(lang, "se_copyAll")}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="rules" icon={<ListChecks size={20} />} title={t(lang, "se_rules")} sub={t(lang, "se_rulesSub")}>
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                <label className="text-sm text-slate-700" htmlFor={f}>{t(lang, `s_${f}` as DictKey)}</label>
                <input
                  id={f}
                  type="number"
                  className="num w-20 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center font-semibold"
                  value={settings[f]}
                  min={0}
                  onChange={(e) => setSettings((s) => ({ ...s, [f]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section id="alerts" icon={<BellRing size={20} />} title={t(lang, "se_alerts")} sub={t(lang, "se_alertsSub")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {channel(true, t(lang, "se_chSound"), t(lang, "se_chSoundHint"))}
            {channel(channels.push, t(lang, "se_chPush"), t(lang, "se_chPushHint"))}
            {channel(channels.whatsapp, "WhatsApp", t(lang, "se_chWaHint"))}
            {channel(channels.sms || channels.smsTest, "SMS", t(lang, "se_chSmsHint"), channels.smsTest)}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <MessageCircle size={14} /> {t(lang, "se_chNote")}
          </p>
        </Section>

        <Section id="security" icon={<KeyRound size={20} />} title={t(lang, "se_security")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pin">{t(lang, "newPin")}</label>
              <input id="pin" className="input num tracking-[0.3em]" dir="ltr" inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={rotateDoor} onChange={(e) => setRotateDoor(e.target.checked)} />
              <span>
                <Smartphone size={15} className="me-1 inline" /> {t(lang, "rotateDoor")}
              </span>
            </label>
          </div>
        </Section>

        <div className="sticky bottom-3 z-20 flex items-center justify-end gap-3 rounded-2xl bg-white/90 p-3 shadow-(--shadow-lift) ring-1 ring-slate-200 backdrop-blur">
          {msg && <p className={`me-auto text-sm font-semibold ${msg.ok ? "text-brand-700" : "text-rose-700"}`} role="status">{msg.text}</p>}
          <button className="btn-primary px-8" disabled={busy}>
            <Save size={18} /> {t(lang, "save")}
          </button>
        </div>
      </div>
    </form>
  );
}
