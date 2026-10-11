"use client";
import { useState } from "react";
import Link from "next/link";
import { Delete, Lock } from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import { Logo } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { dirOf, errorText, t } from "@/lib/i18n";
import { api, ApiError } from "@/lib/client";

/** دخول السكرتيرة: لوحة أرقام كبيرة تناسب اللمس، وتعمل بلوحة المفاتيح أيضاً. */
export default function LoginForm({ lang, slug, name }: { lang: Lang; slug: string; name: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(value = pin) {
    if (value.length < 4 || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/staff/${slug}/login`, { pin: value });
      try {
        const list = JSON.parse(localStorage.getItem("dawri:staffShops") ?? "[]") as string[];
        localStorage.setItem("dawri:staffShops", JSON.stringify([slug, ...list.filter((x) => x !== slug)].slice(0, 5)));
      } catch {}
      location.reload();
    } catch (err) {
      const code = (err as ApiError).code;
      setError(code === "wrong_pin" ? t(lang, "wrongPin") : code === "locked" ? t(lang, "locked") : errorText(lang, code));
      setPin("");
      setBusy(false);
    }
  }

  const press = (d: string) => {
    setError("");
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  return (
    <div className="bg-mesh flex min-h-dvh flex-col" dir={dirOf(lang)} lang={lang}>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/"><Logo size={32} /></Link>
        <LangSwitch lang={lang} />
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-12">
        <form
          className="card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="text-center">
            <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <Lock size={26} />
            </span>
            <h1 className="mt-3 text-xl font-bold">{name}</h1>
            <p className="text-sm text-slate-500">{t(lang, "staffLogin")}</p>
          </div>

          <label className="sr-only" htmlFor="pin">{t(lang, "enterPin")}</label>
          <input
            id="pin"
            className="input num mt-5 text-center text-3xl font-bold tracking-[0.6em]"
            dir="ltr"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            autoFocus
          />

          <div className="mt-4 grid grid-cols-3 gap-2" dir="ltr">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" className="btn-secondary num h-14 text-2xl" onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="btn-ghost h-14" onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t(lang, "a11y_backspace")}>
              <Delete size={22} />
            </button>
            <button type="button" className="btn-secondary num h-14 text-2xl" onClick={() => press("0")}>
              0
            </button>
            <button type="submit" className="btn-primary h-14" disabled={busy || pin.length < 4}>
              {t(lang, "login")}
            </button>
          </div>

          {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700" role="alert">{error}</p>}
        </form>
      </main>
    </div>
  );
}
