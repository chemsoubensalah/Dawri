"use client";
import { useState } from "react";
import { Building2, Stethoscope } from "lucide-react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";
import NewShopForm from "./NewShopForm";

function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** «طبيب واحد» أو «عيادة بعدّة أطبّاء». */
export default function SignupChoice({ lang, needsCode }: { lang: Lang; needsCode: boolean }) {
  const [mode, setMode] = useState<"single" | "clinic">("single");
  const opt = (m: typeof mode, Icon: typeof Stethoscope, title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      data-testid={`signup-${m}`}
      className={`flex items-start gap-3 rounded-2xl p-4 text-start ring-1 transition ${
        mode === m ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-slate-200 hover:bg-slate-50"
      }`}
    >
      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${mode === m ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
        <Icon size={20} />
      </span>
      <span className="leading-snug">
        <span className="block font-bold text-ink">{title}</span>
        <span className="block text-xs text-slate-500">{sub}</span>
      </span>
    </button>
  );
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {opt("single", Stethoscope, t(lang, "cl_single"), t(lang, "cl_singleSub"))}
        {opt("clinic", Building2, t(lang, "cl_multi"), t(lang, "cl_multiSub"))}
      </div>
      {mode === "single" ? <NewShopForm lang={lang} needsCode={needsCode} /> : <NewClinicForm lang={lang} needsCode={needsCode} />}
    </>
  );
}

function NewClinicForm({ lang, needsCode }: { lang: Lang; needsCode: boolean }) {
  const [f, setF] = useState({ name: "", slug: "", email: "", pin: "", doctorName: "", specialty: "", room: "", signupCode: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ slug: string }>("/api/clinics", {
        name: f.name,
        slug: f.slug,
        email: f.email,
        pin: f.pin,
        lang,
        signupCode: f.signupCode,
        doctor: { doctorName: f.doctorName, specialty: f.specialty, room: f.room },
      });
      try {
        const list = JSON.parse(localStorage.getItem("dawri:clinics") ?? "[]") as string[];
        localStorage.setItem("dawri:clinics", JSON.stringify([r.slug, ...list.filter((x) => x !== r.slug)].slice(0, 5)));
      } catch {}
      location.href = `/c/${r.slug}/manage`;
    } catch (err) {
      setError(errorText(lang, (err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-5 p-6" data-testid="new-clinic-form">
      <div>
        <label className="label" htmlFor="c-name">{t(lang, "cl_clinicName")}</label>
        <input
          id="c-name"
          className="input"
          required
          minLength={2}
          maxLength={80}
          value={f.name}
          onChange={(e) => {
            set("name", e.target.value);
            if (!slugTouched) set("slug", suggestSlug(e.target.value));
          }}
          placeholder={t(lang, "cl_clinicNamePh")}
        />
      </div>
      <div>
        <label className="label" htmlFor="c-email">{t(lang, "nw_email")}</label>
        <input id="c-email" className="input text-start" dir="ltr" type="email" autoComplete="email" required maxLength={254} value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="clinique@gmail.com" />
      </div>
      <div>
        <label className="label" htmlFor="c-slug">{t(lang, "shopSlug")}</label>
        <div className="flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100" dir="ltr">
          <span className="ps-4 text-sm whitespace-nowrap text-slate-400">dawri…/c/</span>
          <input
            id="c-slug"
            className="w-full bg-transparent px-1 py-3 outline-none"
            required
            minLength={3}
            maxLength={40}
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            placeholder="clinique-ennour"
            autoCapitalize="none"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="c-pin">{t(lang, "cl_managerPin")}</label>
        <input id="c-pin" className="input num tracking-[0.3em]" dir="ltr" inputMode="numeric" type="password" autoComplete="new-password" required minLength={4} maxLength={8} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} />
        <p className="mt-1.5 text-xs text-slate-500">{t(lang, "cl_managerPinHint")}</p>
      </div>
      <fieldset className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <legend className="px-1 text-sm font-bold text-ink">{t(lang, "cl_firstDoctor")}</legend>
        <div>
          <label className="label" htmlFor="c-doc">{t(lang, "st_doctorName")}</label>
          <input id="c-doc" className="input" required minLength={2} maxLength={80} value={f.doctorName} onChange={(e) => set("doctorName", e.target.value)} placeholder={t(lang, "nw_doctorPh")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-spec">{t(lang, "cl_specialty")}</label>
            <input id="c-spec" className="input" maxLength={80} value={f.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder={t(lang, "se_specialtyPh")} />
          </div>
          <div>
            <label className="label" htmlFor="c-room">{t(lang, "cl_room")}</label>
            <input id="c-room" className="input" maxLength={30} value={f.room} onChange={(e) => set("room", e.target.value)} placeholder={t(lang, "cl_roomPh")} />
          </div>
        </div>
      </fieldset>
      {needsCode && (
        <div>
          <label className="label" htmlFor="c-code">{t(lang, "signupCode")}</label>
          <input id="c-code" className="input" dir="ltr" value={f.signupCode} onChange={(e) => set("signupCode", e.target.value)} required />
        </div>
      )}
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      <button className="btn-primary w-full text-lg" disabled={busy}>{busy ? "…" : t(lang, "cl_create")}</button>
      <p className="text-center text-xs leading-relaxed text-slate-500">{t(lang, "cl_trialNote")}</p>
    </form>
  );
}
