"use client";
import { useState } from "react";
import LangSwitch from "@/components/LangSwitch";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

export default function LoginForm({ lang, slug, name }: { lang: Lang; slug: string; name: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-sm space-y-4 p-5">
      <header className="flex items-center justify-between">
        <span className="text-xl font-black text-brand-700">{t(lang, "appName")}</span>
        <LangSwitch lang={lang} />
      </header>
      <form
        className="card space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`/api/staff/${slug}/login`, { pin });
            location.reload();
          } catch (err) {
            const code = (err as ApiError).code;
            setError(code === "wrong_pin" ? t(lang, "wrongPin") : code === "locked" ? t(lang, "locked") : errorText(lang, code));
            setBusy(false);
          }
        }}
      >
        <h1 className="text-xl font-extrabold">{name}</h1>
        <p className="text-slate-600">{t(lang, "staffLogin")}</p>
        <label className="label" htmlFor="pin">{t(lang, "enterPin")}</label>
        <input
          id="pin"
          className="input num text-center text-3xl tracking-[0.4em]"
          dir="ltr"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        {error && <p className="font-semibold text-red-700" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || pin.length < 4}>{t(lang, "login")}</button>
      </form>
    </main>
  );
}
