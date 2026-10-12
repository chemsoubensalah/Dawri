"use client";
import { useState } from "react";
import { FlaskConical, Scissors, Smile, Stethoscope, Store } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

const KINDS = [
  { k: "doctor", icon: Stethoscope },
  { k: "dentist", icon: Smile },
  { k: "lab", icon: FlaskConical },
  { k: "barber", icon: Scissors },
  { k: "other", icon: Store },
] as const;

/** اقتراح رابط قصير من الاسم (الحروف اللاتينية فقط). */
function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export default function NewShopForm({ lang, needsCode }: { lang: Lang; needsCode: boolean }) {
  const [name, setName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["k"]>("doctor");
  const [pin, setPin] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ slug: string }>("/api/shops", { name, slug, kind, pin, lang, signupCode, doctorName, email });
      try {
        const list = JSON.parse(localStorage.getItem("dawri:staffShops") ?? "[]") as string[];
        localStorage.setItem("dawri:staffShops", JSON.stringify([r.slug, ...list.filter((x) => x !== r.slug)].slice(0, 5)));
      } catch {}
      location.href = `/staff/${r.slug}/welcome`;
    } catch (err) {
      setError(errorText(lang, (err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-6 space-y-5 p-6">
      <div>
        <label className="label" htmlFor="name">{t(lang, "shopName")}</label>
        <input
          id="name"
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(suggestSlug(e.target.value));
          }}
          placeholder={t(lang, "nw_namePh")}
          required
          minLength={2}
          maxLength={80}
        />
      </div>
      <div>
        <label className="label" htmlFor="doctor">{t(lang, "st_doctorName")} <span className="font-normal text-slate-400">({t(lang, "optional")})</span></label>
        <input id="doctor" className="input" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder={t(lang, "nw_doctorPh")} maxLength={80} />
      </div>
      <div>
        <label className="label" htmlFor="email">{t(lang, "nw_email")}</label>
        <input id="email" className="input text-start" dir="ltr" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="docteur@gmail.com" />
        <p className="mt-1.5 text-xs text-slate-500">{t(lang, "nw_emailHint")}</p>
      </div>
      <div>
        <label className="label">{t(lang, "shopKind")}</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {KINDS.map(({ k, icon: Icon }) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-sm font-semibold ring-1 transition ${
                kind === k ? "bg-brand-50 text-brand-800 ring-2 ring-brand-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <Icon size={22} />
              {t(lang, `kind_${k}` as DictKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="slug">{t(lang, "shopSlug")}</label>
        <div className="flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100" dir="ltr">
          <span className="ps-4 text-sm whitespace-nowrap text-slate-400">dawri…/s/</span>
          <input
            id="slug"
            className="w-full bg-transparent px-1 py-3 outline-none"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            placeholder="dr-benali"
            required
            minLength={3}
            maxLength={40}
            autoCapitalize="none"
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{t(lang, "nw_slugHint")}</p>
      </div>
      <div>
        <label className="label" htmlFor="pin">{t(lang, "pin")}</label>
        <input
          id="pin"
          className="input num tracking-[0.3em]"
          dir="ltr"
          inputMode="numeric"
          type="password"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
          minLength={4}
          maxLength={8}
        />
        <p className="mt-1.5 text-xs text-slate-500">{t(lang, "nw_pinHint")}</p>
      </div>
      {needsCode && (
        <div>
          <label className="label" htmlFor="code">{t(lang, "signupCode")}</label>
          <input id="code" className="input" dir="ltr" value={signupCode} onChange={(e) => setSignupCode(e.target.value)} required />
        </div>
      )}
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      <button className="btn-primary w-full text-lg" disabled={busy}>{busy ? "…" : t(lang, "nw_create")}</button>
      <p className="text-center text-xs text-slate-500">{t(lang, "nw_trialNote")}</p>
    </form>
  );
}
