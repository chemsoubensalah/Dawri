"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Building2, Check, CheckCircle2, Clock3, ExternalLink, KeyRound, ListChecks, MessageCircle, Palette, Plus, Save, Smartphone, Trash2, XCircle } from "lucide-react";
import { DISPLAY_STYLES, THEMES, type DisplayStyle, type Interval, type Lang, type ShopLook, type ShopProfile, type ShopSettings, type ThemeKey, type WeeklyHours } from "@/lib/domain/types";
import { applyTheme, swatch } from "@/lib/theme";
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

/** مصغّر لتصميم شاشة القاعة (يتبع اللون المختار عبر متغيّرات brand). */
function DisplayThumb({ style }: { style: DisplayStyle }) {
  const bg =
    style === "night"
      ? "bg-[#061420]"
      : style === "light"
        ? "bg-[#eef1f5]"
        : "bg-[linear-gradient(135deg,var(--color-brand-600),var(--color-brand-900))]";
  const card = style === "light" ? "bg-white ring-1 ring-slate-200" : style === "night" ? "bg-white/10" : "bg-white/15";
  const ball =
    style === "color"
      ? "bg-white text-brand-700"
      : "bg-[radial-gradient(circle_at_30%_25%,var(--color-brand-400),var(--color-brand-700)_70%)] text-white";
  const bar = style === "light" ? "bg-slate-300" : "bg-white/40";
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-xl p-2 ${bg}`} aria-hidden>
      <div className="flex items-center justify-between">
        <span className={`h-1.5 w-10 rounded-full ${bar}`} />
        <span className={`h-1.5 w-5 rounded-full ${bar}`} />
      </div>
      <div className="mt-1.5 grid h-[calc(100%-0.875rem)] grid-cols-[1.5fr_1fr] gap-1.5">
        <div className={`flex items-center justify-center rounded-lg ${card}`}>
          <span className={`num flex size-9 items-center justify-center rounded-full text-sm font-bold ${ball}`}>12</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className={`flex-1 rounded-lg ${card}`} />
          <div className="flex-1 rounded-lg bg-white" />
        </div>
      </div>
    </div>
  );
}

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
  initial: { name: string; hours: WeeklyHours; settings: ShopSettings; defaultLang: Lang; profile: ShopProfile; look: ShopLook };
}) {
  const [name, setName] = useState(initial.name);
  const [profile, setProfile] = useState<ShopProfile>(initial.profile);
  const [hours, setHours] = useState<WeeklyHours>(initial.hours);
  const [settings, setSettings] = useState(initial.settings);
  const [defaultLang, setDefaultLang] = useState(initial.defaultLang);
  const [look, setLook] = useState<ShopLook>(initial.look);
  // آخر لون محفوظ: نعيده إن غادر الطبيب الصفحة دون حفظ
  const savedTheme = useRef<ThemeKey>(initial.look.theme);
  const [newPin, setNewPin] = useState("");
  const [rotateDoor, setRotateDoor] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const pickTheme = (theme: ThemeKey) => {
    setLook((l) => ({ ...l, theme }));
    const root = document.querySelector<HTMLElement>("[data-theme-root]");
    if (root) applyTheme(root, theme); // معاينة حيّة في الصفحة كلّها
  };
  useEffect(
    () => () => {
      const root = document.querySelector<HTMLElement>("[data-theme-root]");
      if (root) applyTheme(root, savedTheme.current);
    },
    [],
  );

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
        look,
        newPin: newPin || undefined,
        rotateDoor,
      });
      savedTheme.current = look.theme;
      setMsg({ ok: true, text: t(lang, "saved") });
      router.refresh(); // يحدّث الاسم في الشريط العلوي
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
              ["look", "se_look"],
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

        <Section id="look" icon={<Palette size={20} />} title={t(lang, "se_look")} sub={t(lang, "se_lookSub")}>
          <div className="label">{t(lang, "se_color")}</div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-9" role="radiogroup" aria-label={t(lang, "se_color")}>
            {THEMES.map((th) => {
              const on = look.theme === th;
              return (
                <button
                  type="button"
                  key={th}
                  role="radio"
                  aria-checked={on}
                  data-testid={`theme-${th}`}
                  onClick={() => pickTheme(th)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs font-semibold transition ${
                    on ? "bg-slate-50 text-ink ring-2 ring-slate-900/80" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="inline-flex size-10 items-center justify-center rounded-full text-white shadow-[inset_0_-4px_10px_rgb(0_0_0/0.18)]"
                    style={{ background: swatch(th) }}
                  >
                    {on && <Check size={20} strokeWidth={3} />}
                  </span>
                  {t(lang, `theme_${th}` as DictKey)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t(lang, "se_lookNote")}</p>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
            <div className="text-sm font-semibold text-slate-600">{t(lang, "se_display")}</div>
            <a
              href={`/d/${slug}?style=${look.display}&theme=${look.theme}`}
              target="_blank"
              rel="noopener"
              className="btn-ghost btn-sm text-brand-700"
            >
              <ExternalLink size={15} /> {t(lang, "se_preview")}
            </a>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t(lang, "se_display")}>
            {DISPLAY_STYLES.map((ds) => {
              const on = look.display === ds;
              return (
                <button
                  type="button"
                  key={ds}
                  role="radio"
                  aria-checked={on}
                  data-testid={`display-${ds}`}
                  onClick={() => setLook((l) => ({ ...l, display: ds }))}
                  className={`relative rounded-2xl bg-white p-2.5 text-start transition ${
                    on ? "ring-2 ring-brand-600 shadow-(--shadow-brand)" : "ring-1 ring-slate-200 hover:ring-slate-300"
                  }`}
                >
                  <DisplayThumb style={ds} />
                  <div className="mt-2.5 flex items-start justify-between gap-2 px-1">
                    <div>
                      <div className="font-bold text-ink">{t(lang, `ds_${ds}` as DictKey)}</div>
                      <div className="text-xs text-slate-500">{t(lang, `ds_${ds}Hint` as DictKey)}</div>
                    </div>
                    <span
                      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
                        on ? "bg-brand-600 text-white" : "ring-1 ring-slate-300"
                      }`}
                    >
                      {on && <Check size={13} strokeWidth={3} />}
                    </span>
                  </div>
                </button>
              );
            })}
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
