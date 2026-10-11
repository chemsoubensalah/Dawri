"use client";
import { useEffect, useRef, useState } from "react";
import LangSwitch from "@/components/LangSwitch";
import PushButton from "@/components/PushButton";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { alertBeep, api, ApiError, saveTicket, usePoll } from "@/lib/client";
import type { TicketView } from "@/lib/server/service";

const ACTIVE = ["pending_approval", "waiting", "called", "deferred"];

export default function TicketClient({ lang, initial }: { lang: Lang; initial: TicketView }) {
  const [v, setV] = useState(initial);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prev = useRef(initial);

  useEffect(() => saveTicket(initial.shop.slug, initial.id), [initial.shop.slug, initial.id]);

  // تنبيه صوتيّ واهتزاز حين يتغيّر شيء مهمّ والصفحة مفتوحة
  useEffect(() => {
    const p = prev.current;
    if (
      (v.status === "called" && p.status !== "called") ||
      (v.comeNow && !p.comeNow) ||
      (v.askConfirm && !p.askConfirm)
    ) {
      alertBeep();
    }
    prev.current = v;
    const prefix = v.status === "called" ? "🔔 " : v.ahead !== null ? `(${v.ahead}) ` : "";
    document.title = `${prefix}${t(lang, "appName")} ${v.number}`;
  }, [v, lang]);

  const active = ACTIVE.includes(v.status);
  const fast = v.status === "called" || v.status === "deferred" || (v.ahead !== null && v.ahead <= 3);
  usePoll(
    async () => {
      if (!active) return;
      try {
        setV(await api<TicketView>(`/api/t/${v.id}`));
        setOnline(true);
      } catch (e) {
        if ((e as ApiError).code === "network") setOnline(false);
      }
    },
    fast ? 5000 : 10000,
  );

  async function act(action: "confirm" | "cancel") {
    if (action === "cancel" && !confirm(t(lang, "cancelSure"))) return;
    setBusy(true);
    setError("");
    try {
      setV(await api<TicketView>(`/api/t/${v.id}`, { action }));
    } catch (e) {
      setError(errorText(lang, (e as ApiError).code));
    } finally {
      setBusy(false);
    }
  }

  const doneText = v.shop.kind === "doctor" || v.shop.kind === "dentist" ? "statusDone" : "statusDoneGeneric";

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-brand-700">{t(lang, "appName")}</div>
          <h1 className="text-xl font-extrabold leading-tight">{v.shop.name}</h1>
        </div>
        <LangSwitch lang={lang} />
      </header>

      {!online && (
        <div className="rounded-xl bg-slate-800 p-2 text-center text-sm text-white">{t(lang, "offline")}</div>
      )}

      <section
        className={`card text-center ${v.status === "called" ? "bg-brand-600 text-white ring-brand-600" : ""}`}
        aria-live="polite"
      >
        <div className={`text-sm ${v.status === "called" ? "text-brand-100" : "text-slate-500"}`}>{t(lang, "yourNumber")}</div>
        <div className="num text-8xl font-black leading-none" data-testid="my-number">{v.number}</div>
        <div className="mt-1 text-lg font-semibold">{v.name}</div>

        {v.status === "called" && (
          <div className="mt-4 space-y-1">
            <p className="text-3xl font-black" data-testid="status">{t(lang, "statusCalled")}</p>
            {!v.arrived && <p className="text-brand-50">{t(lang, "statusCalledHint")}</p>}
          </div>
        )}

        {v.status === "waiting" && !v.held && v.ahead !== null && (
          <div className="mt-4 space-y-1" data-testid="status">
            <p className="text-2xl font-extrabold">
              {v.ahead === 0 ? t(lang, "ahead0") : v.ahead === 1 ? t(lang, "ahead1") : t(lang, "aheadN", { n: v.ahead })}
            </p>
            {v.etaMin !== null && v.ahead > 0 && (
              <p className="text-lg text-slate-600">
                {v.etaMin <= 3 ? t(lang, "etaSoon") : t(lang, "etaAbout", { n: v.etaMin })}
              </p>
            )}
          </div>
        )}

        {v.currentNumber !== null && v.status !== "called" && active && (
          <p className="mt-3 text-slate-500">
            {t(lang, "nowServing")}: <b className="num text-slate-800">{v.currentNumber}</b>
          </p>
        )}
      </section>

      {v.status === "waiting" && v.comeNow && !v.arrived && (
        <div className="animate-pulse rounded-3xl bg-brand-600 p-4 text-center text-2xl font-black text-white">
          {t(lang, "comeNow")}
        </div>
      )}

      {v.askConfirm && (
        <section className="card space-y-3 bg-amber-50 ring-amber-300" data-testid="confirm-box">
          <p className="text-xl font-extrabold text-amber-900">{v.held ? t(lang, "heldTitle") : t(lang, "stillComing")}</p>
          <p className="text-amber-800">
            {v.held ? t(lang, "heldHint") : t(lang, "stillComingHint", { n: v.confirmTimeoutMin })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => act("confirm")} disabled={busy}>
              {t(lang, "yesComing")}
            </button>
            <button className="btn-danger" onClick={() => act("cancel")} disabled={busy}>
              {t(lang, "cancelTicket")}
            </button>
          </div>
        </section>
      )}

      {v.status === "deferred" && (
        <section className="card space-y-2 bg-amber-50 ring-amber-300" data-testid="status">
          <p className="text-xl font-extrabold text-amber-900">{t(lang, "statusDeferred")}</p>
          <p className="text-amber-800">{t(lang, "deferredHint", { n: v.deferredLeftMin ?? v.lateWindowMin })}</p>
        </section>
      )}

      {v.status === "pending_approval" && (
        <section className="card bg-amber-50 text-center text-lg font-semibold text-amber-900 ring-amber-300" data-testid="status">
          {t(lang, "statusPending")}
        </section>
      )}

      {!active && (
        <section className="card text-center text-xl font-bold" data-testid="status">
          {v.status === "done" && t(lang, doneText)}
          {v.status === "cancelled" && t(lang, "statusCancelled")}
          {v.status === "no_show" && t(lang, "statusNoShow")}
          {v.status === "expired" && t(lang, "statusExpired")}
          {v.status === "rejected" && t(lang, "statusRejected")}
        </section>
      )}

      {error && <p className="text-center font-semibold text-red-700" role="alert">{error}</p>}

      {active && (
        <>
          <section className="card space-y-3">
            {v.arrived ? (
              <p className="text-center text-lg font-bold text-brand-700">{t(lang, "arrived")}</p>
            ) : (
              <p className="text-center text-slate-700">{t(lang, "checkInHint")}</p>
            )}
            <PushButton lang={lang} ticketId={v.id} pushKey={v.pushKey} />
            <p className="text-center text-sm text-slate-500">{t(lang, "keepOpen")}</p>
          </section>
          {!v.askConfirm && v.status !== "called" && (
            <button className="btn-danger w-full" onClick={() => act("cancel")} disabled={busy}>
              {t(lang, "cancelTicket")}
            </button>
          )}
        </>
      )}

      <p className="text-center">
        <a className="text-sm text-slate-500 underline" href={`/s/${v.shop.slug}`}>
          {t(lang, "backToShop")}
        </a>
      </p>
    </main>
  );
}
