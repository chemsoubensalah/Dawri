"use client";
import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import { Logo } from "@/components/ui";
import type { Lang, ShopLook } from "@/lib/domain/types";
import { themeVars } from "@/lib/theme";
import { dirOf, errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

export default function ResetForm({ lang, slug, name, look, token }: { lang: Lang; slug: string; name: string; look: ShopLook; token: string }) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  return (
    <div className="bg-mesh flex min-h-dvh flex-col" dir={dirOf(lang)} lang={lang} style={themeVars(look)}>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo size={32} /></Link>
        <LangSwitch lang={lang} />
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-12">
        <form
          className="card space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (pin !== again) return setError(t(lang, "rs_mismatch"));
            setBusy(true);
            try {
              await api(`/api/staff/${slug}/reset`, { token, pin });
              location.href = `/staff/${slug}`;
            } catch (err) {
              setError(errorText(lang, (err as ApiError).code));
              setBusy(false);
            }
          }}
        >
          <div className="text-center">
            <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <KeyRound size={26} />
            </span>
            <h1 className="mt-3 text-xl font-bold">{t(lang, "rs_title")}</h1>
            <p className="text-sm text-slate-500">{name}</p>
          </div>
          <div>
            <label className="label" htmlFor="pin">{t(lang, "rs_pin")}</label>
            <input id="pin" className="input num text-center text-2xl font-bold tracking-[0.5em]" dir="ltr" type="password" inputMode="numeric" autoComplete="new-password" required minLength={4} maxLength={8} value={pin} onChange={(e) => setPin(digits(e.target.value))} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="again">{t(lang, "rs_confirm")}</label>
            <input id="again" className="input num text-center text-2xl font-bold tracking-[0.5em]" dir="ltr" type="password" inputMode="numeric" autoComplete="new-password" required minLength={4} maxLength={8} value={again} onChange={(e) => setAgain(digits(e.target.value))} />
          </div>
          <button className="btn-primary w-full" disabled={busy || pin.length < 4} data-testid="reset-save">
            {t(lang, "rs_save")}
          </button>
          {error && (
            <p className="rounded-xl bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700" role="alert">
              {error}{" "}
              {error === errorText(lang, "reset_invalid") && (
                <Link href={`/staff/${slug}`} className="underline">{t(lang, "lg_forgot")}</Link>
              )}
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
