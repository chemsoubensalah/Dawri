"use client";
import { useState } from "react";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

const KINDS = ["doctor", "dentist", "lab", "barber", "other"] as const;

export default function NewShopForm({ lang, needsCode }: { lang: Lang; needsCode: boolean }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("doctor");
  const [pin, setPin] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ slug: string }>("/api/shops", { name, slug, kind, pin, lang, signupCode });
      location.href = `/staff/${r.slug}`;
    } catch (err) {
      setError(errorText(lang, (err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <label className="label" htmlFor="name">{t(lang, "shopName")}</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
      </div>
      <div>
        <label className="label" htmlFor="slug">{t(lang, "shopSlug")}</label>
        <input
          id="slug"
          className="input"
          dir="ltr"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="dr-benali"
          required
          minLength={3}
          maxLength={40}
        />
      </div>
      <div>
        <label className="label">{t(lang, "shopKind")}</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-xl px-3 py-2 font-semibold ring-1 ${kind === k ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-300"}`}
            >
              {t(lang, `kind_${k}` as DictKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pin">{t(lang, "pin")}</label>
        <input id="pin" className="input num" dir="ltr" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required minLength={4} maxLength={8} />
      </div>
      {needsCode && (
        <div>
          <label className="label" htmlFor="code">{t(lang, "signupCode")}</label>
          <input id="code" className="input" dir="ltr" value={signupCode} onChange={(e) => setSignupCode(e.target.value)} required />
        </div>
      )}
      {error && <p className="font-semibold text-red-700" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{t(lang, "create")}</button>
    </form>
  );
}
