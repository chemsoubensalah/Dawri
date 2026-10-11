"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LangSwitch from "@/components/LangSwitch";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, type DictKey } from "@/lib/i18n";
import { api, ApiError, saveTicket, savedTicket, usePoll } from "@/lib/client";
import type { PublicShopView } from "@/lib/server/service";

const PROFILE = "dawri:profile";

export default function ShopClient({ lang, initial, door }: { lang: Lang; initial: PublicShopView; door: string | null }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [mine, setMine] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [arrivedMsg, setArrivedMsg] = useState(false);

  useEffect(() => {
    const id = savedTicket(view.slug);
    setMine(id);
    // تذكرة اليوم موجودة ولم يأتِ من رمز الباب ← نفتحها مباشرة
    if (id && !door) router.replace(`/t/${id}`);
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE) ?? "{}");
      if (p.name) setName(p.name);
      if (p.phone) setPhone(p.phone);
    } catch {}
  }, [view.slug, door, router]);

  usePoll(async () => setView(await api<PublicShopView>(`/api/s/${view.slug}`)), 20000);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(lang, (e as ApiError).code));
    } finally {
      setBusy(false);
    }
  }

  const finish = (ticketId: string) => {
    saveTicket(view.slug, ticketId);
    try {
      localStorage.setItem(PROFILE, JSON.stringify({ name, phone }));
    } catch {}
    router.push(`/t/${ticketId}`);
  };

  const sendCode = () =>
    run(async () => {
      const r = await api<{ verify: boolean; devCode?: string }>(`/api/s/${view.slug}/code`, { name, phone, lang });
      if (!r.verify) {
        const tk = await api<{ ticketId: string }>(`/api/s/${view.slug}/tickets`, { name, phone, door, lang });
        return finish(tk.ticketId);
      }
      setDevCode(r.devCode ?? null);
      setStep("code");
    });

  const confirm = () =>
    run(async () => {
      const tk = await api<{ ticketId: string }>(`/api/s/${view.slug}/tickets`, { name, phone, code, door, lang });
      finish(tk.ticketId);
    });

  const checkIn = () =>
    run(async () => {
      await api(`/api/t/${mine}`, { action: "checkin", door });
      setArrivedMsg(true);
      setTimeout(() => router.push(`/t/${mine}`), 800);
    });

  const etaNew = Math.round((view.waiting + (view.currentNumber ? 1 : 0)) * view.avgServiceMin);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-brand-700">{t(lang, "appName")}</div>
          <h1 className="text-2xl font-extrabold leading-tight">{view.name}</h1>
          <div className="text-slate-500">{t(lang, `kind_${view.kind}` as DictKey)}</div>
        </div>
        <LangSwitch lang={lang} />
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <div className="text-sm text-slate-500">{t(lang, "nowServing")}</div>
          <div className="num text-4xl font-black">{view.currentNumber ?? "—"}</div>
        </div>
        <div className="card text-center">
          <div className="text-sm text-slate-500">{t(lang, "waitingCount")}</div>
          <div className="num text-4xl font-black">{view.waiting}</div>
          {view.waiting > 0 && (
            <div className="text-xs text-slate-500">≈ {etaNew} {t(lang, "minutes")}</div>
          )}
        </div>
      </section>

      {mine && door ? (
        <section className="card space-y-3 text-center">
          <p className="text-lg font-semibold">{t(lang, "yourTicketToday")}</p>
          {arrivedMsg ? (
            <p className="text-xl font-bold text-brand-700">{t(lang, "arrivedOk")}</p>
          ) : (
            <button className="btn-primary w-full py-5 text-2xl" onClick={checkIn} disabled={busy}>
              {t(lang, "iArrived")}
            </button>
          )}
          <a className="block font-semibold text-brand-700 underline" href={`/t/${mine}`}>
            {t(lang, "openMyTicket")}
          </a>
          {error && <p className="font-semibold text-red-700" role="alert">{error}</p>}
        </section>
      ) : view.blocker ? (
        <section className="card space-y-2 text-center">
          <p className="text-xl font-bold text-amber-700">{errorText(lang, view.blocker)}</p>
          <p className="text-slate-600">
            {t(lang, "hoursToday")}:{" "}
            <span dir="ltr" className="num font-semibold">
              {view.hoursToday.length ? view.hoursToday.map(([a, b]) => `${a}–${b}`).join(" · ") : t(lang, "closedToday")}
            </span>
          </p>
        </section>
      ) : (
        <section className="card space-y-4">
          <h2 className="text-xl font-extrabold">{t(lang, "takeNumber")}</h2>
          {step === "form" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
            >
              <div>
                <label className="label" htmlFor="name">{t(lang, "yourName")}</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={60} />
              </div>
              <div>
                <label className="label" htmlFor="phone">{t(lang, "yourPhone")}</label>
                <input
                  id="phone"
                  className="input num"
                  dir="ltr"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={t(lang, "phonePlaceholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              {error && <p className="font-semibold text-red-700" role="alert">{error}</p>}
              <button className="btn-primary w-full" disabled={busy}>
                {view.verifyPhone ? t(lang, "sendCode") : t(lang, "takeNumber")}
              </button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              <p className="text-slate-700">{t(lang, "codeSent")}</p>
              {devCode && (
                <p className="rounded-xl bg-amber-50 p-2 text-center text-amber-800">
                  {t(lang, "demoCode")} <b className="num" dir="ltr">{devCode}</b>
                </p>
              )}
              <div>
                <label className="label" htmlFor="code">{t(lang, "codeLabel")}</label>
                <input
                  id="code"
                  className="input num text-center text-2xl tracking-[0.4em]"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="font-semibold text-red-700" role="alert">{error}</p>}
              <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
                {t(lang, "confirmTicket")}
              </button>
              <button type="button" className="w-full text-center text-sm text-slate-500 underline" onClick={() => setStep("form")}>
                {t(lang, "changePhone")}
              </button>
            </form>
          )}
          <p className="text-sm text-slate-500">{t(lang, "privacy")}</p>
        </section>
      )}
      <p className="text-center text-sm text-slate-500">{t(lang, "noSmartphone")}</p>
    </main>
  );
}
