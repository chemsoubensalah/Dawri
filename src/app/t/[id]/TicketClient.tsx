"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Clock3, DoorOpen, Hourglass, MessageCircle, Share2, ShieldAlert, Ticket, WifiOff, XCircle } from "lucide-react";
import ClinicCard from "@/components/ClinicCard";
import { ConfirmDialog } from "@/components/Dialog";
import PushButton from "@/components/PushButton";
import SoundGate from "@/components/SoundGate";
import { Chip } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { aheadText, errorText, t } from "@/lib/i18n";
import { api, ApiError, playSound, saveTicket, usePoll } from "@/lib/client";
import type { TicketView } from "@/lib/server/service";

const ACTIVE = ["pending_approval", "waiting", "called", "deferred"];

function clock(lang: Lang, d: Date) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Algiers",
    numberingSystem: "latn",
  }).format(d);
}

/** حلقة تقدّم: كم قطع من الطريق منذ أخذ رقمه. */
function Ring({ ahead, progress }: { ahead: number; progress: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0" aria-hidden="true">
      <circle cx="56" cy="56" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle
        cx="56"
        cy="56"
        r={r}
        fill="none"
        stroke="url(#ring-g)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(Math.max(progress, 0.04), 1))}
        transform="rotate(-90 56 56)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-brand-400)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-brand-700)" }} />
        </linearGradient>
      </defs>
      <text x="56" y="64" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0b1b2b" className="num">
        {ahead}
      </text>
    </svg>
  );
}

export default function TicketClient({ lang, initial }: { lang: Lang; initial: TicketView }) {
  const [v, setV] = useState(initial);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [askCancel, setAskCancel] = useState(false);
  const [copied, setCopied] = useState(false);
  const prev = useRef(initial);

  useEffect(() => {
    // أخذ رقمه للتوّ على هذا الجهاز: نحفظها كتذكرته ونُسمعه نغمة التأكيد.
    // (من يفتح رابط تذكرة شخص آخر لا تُحفظ عنده)
    try {
      if (sessionStorage.getItem("dawri:justTook") === initial.id) {
        sessionStorage.removeItem("dawri:justTook");
        saveTicket(initial.shop.slug, initial.id);
        playSound("taken");
      }
    } catch {}
  }, [initial.shop.slug, initial.id]);

  // الأصوات حين يتغيّر شيء والصفحة مفتوحة
  useEffect(() => {
    const p = prev.current;
    if (
      (v.status === "called" && p.status !== "called") ||
      (v.status === "deferred" && p.status !== "deferred") ||
      (v.comeNow && !p.comeNow) ||
      (v.askConfirm && !p.askConfirm)
    ) {
      playSound("alarm"); // دورك / تعال الآن / هل ما زلت قادماً؟
    } else if (v.currentNumber !== p.currentNumber && v.currentNumber !== null && v.status === "waiting") {
      playSound("moved"); // تقدّم الطابور
    }
    prev.current = v;
    const prefix = v.status === "called" ? "🔔 " : v.ahead !== null ? `(${v.ahead}) ` : "";
    document.title = `${prefix}${t(lang, "appName")} · ${v.number}`;
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

  async function share() {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${v.shop.name} — ${v.number}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }

  const waiting = v.status === "waiting" && !v.held;
  const amber = v.status === "deferred" || v.status === "pending_approval" || (v.status === "waiting" && v.held);
  const band =
    v.status === "called"
      ? "from-brand-500 to-brand-700"
      : amber
        ? "from-amber-400 to-amber-600"
        : active
          ? "from-brand-600 to-brand-800"
          : v.status === "done"
            ? "from-slate-600 to-slate-800"
            : "from-slate-400 to-slate-500";
  const progress = v.ahead !== null ? v.servedSince / Math.max(v.servedSince + v.ahead, 1) : 0;
  const etaAt = v.etaMin !== null ? new Date(Date.now() + v.etaMin * 60000) : null;
  const doneText = v.shop.kind === "doctor" || v.shop.kind === "dentist" ? "statusDone" : "statusDoneGeneric";

  // الخطّ الزمني
  const stage = v.status === "done" ? 4 : v.status === "called" ? 3 : waiting && (v.comeNow || (v.ahead ?? 99) <= 1) ? 2 : 1;
  const steps: [string, string | null][] = [
    [t(lang, "tk_tl1"), clock(lang, new Date(v.createdAt))],
    [t(lang, "tk_tl2"), null],
    [t(lang, "tk_tl3"), v.calledAt ? clock(lang, new Date(v.calledAt)) : null],
    [t(lang, "tk_tl4"), null],
  ];

  return (
    <>
      {!online && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-ink p-2.5 text-sm text-white">
          <WifiOff size={16} /> {t(lang, "offline")}
        </div>
      )}

      {/* ——— التذكرة ——— */}
      <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-(--shadow-lift) ring-1 ring-slate-200/70" aria-live="polite">
        <div className={`relative bg-gradient-to-br ${band} px-6 pt-5 pb-7 text-white`}>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-semibold opacity-90">
              <Ticket size={16} /> {v.shop.name}
            </span>
            <span className="num opacity-80" dir="ltr">{clock(lang, new Date(v.createdAt))}</span>
          </div>
          <div className="mt-4 text-center">
            <div className="text-sm font-medium opacity-85">{t(lang, "yourNumber")}</div>
            <div className={`num text-8xl leading-none font-bold ${v.status === "called" ? "animate-pop" : ""}`} data-testid="my-number">
              {v.number}
            </div>
            <div className="mt-2 text-lg font-semibold opacity-95">{v.name}</div>
            {v.priority && <div className="mt-2 inline-flex rounded-full bg-white/20 px-3 py-0.5 text-sm font-bold" data-testid="ticket-priority">★ {t(lang, "ap_badge")}</div>}
          </div>
        </div>
        {/* خطّ القطع */}
        <div className="relative h-0">
          <span className="absolute -top-3 size-6 rounded-full bg-[#f5f7fa] ltr:-left-3 rtl:-right-3" />
          <span className="absolute -top-3 size-6 rounded-full bg-[#f5f7fa] ltr:-right-3 rtl:-left-3" />
          <span className="absolute inset-x-5 -top-px border-t-2 border-dashed border-white/60" />
        </div>

        <div className="p-6" data-testid="status">
          {v.status === "called" && (
            <div className="text-center">
              <span className="mx-auto mb-3 inline-flex size-16 animate-pulse-ring items-center justify-center rounded-full bg-brand-600 text-white">
                <DoorOpen size={30} />
              </span>
              <p className="text-3xl font-bold text-brand-800">{t(lang, "statusCalled")}</p>
              {!v.arrived && <p className="mt-2 text-slate-600">{t(lang, "statusCalledHint")}</p>}
            </div>
          )}

          {waiting && v.ahead !== null && (
            <div className="flex items-center gap-5">
              <Ring ahead={v.ahead} progress={progress} />
              <div className="min-w-0">
                <p className="text-xl leading-snug font-bold">
                  {aheadText(lang, v.ahead)}
                </p>
                {v.etaMin !== null && v.ahead > 0 && (
                  <p className="mt-1 text-slate-600">
                    {v.etaMin <= 3 ? t(lang, "etaSoon") : t(lang, "etaAbout", { n: v.etaMin })}
                  </p>
                )}
                {etaAt && v.ahead > 0 && v.etaMin! > 3 && (
                  <Chip tone="green" className="mt-2">
                    <Clock3 size={13} /> {t(lang, "tk_around")} <span className="num" dir="ltr">{clock(lang, etaAt)}</span>
                  </Chip>
                )}
              </div>
            </div>
          )}

          {v.status === "waiting" && v.held && (
            <div className="flex items-center gap-3 text-amber-800">
              <ShieldAlert size={28} className="shrink-0" />
              <p className="font-bold">{t(lang, "heldTitle")}</p>
            </div>
          )}

          {v.status === "deferred" && (
            <div className="space-y-2 text-amber-900">
              <p className="flex items-center gap-2 text-xl font-bold">
                <Hourglass size={22} /> {t(lang, "statusDeferred")}
              </p>
              <p>{t(lang, "deferredHint", { n: v.deferredLeftMin ?? v.lateWindowMin })}</p>
            </div>
          )}

          {v.status === "pending_approval" && (
            <p className="flex items-center gap-3 font-semibold text-amber-900">
              <Hourglass size={24} className="shrink-0" /> {t(lang, "statusPending")}
            </p>
          )}

          {!active && (
            <div className="text-center">
              {v.status === "done" ? (
                <CheckCircle2 size={48} className="mx-auto text-brand-600" />
              ) : (
                <XCircle size={48} className="mx-auto text-slate-400" />
              )}
              <p className="mt-2 text-xl font-bold">
                {v.status === "done" && t(lang, doneText)}
                {v.status === "cancelled" && t(lang, "statusCancelled")}
                {v.status === "no_show" && t(lang, "statusNoShow")}
                {v.status === "expired" && t(lang, "statusExpired")}
                {v.status === "rejected" && t(lang, "statusRejected")}
              </p>
            </div>
          )}

          {v.currentNumber !== null && v.status !== "called" && active && (
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
              <span className="text-sm text-slate-500">{t(lang, "nowServing")}</span>
              <span className="num text-2xl font-bold">{v.currentNumber}</span>
            </div>
          )}
        </div>
      </section>

      {v.status === "waiting" && v.comeNow && !v.arrived && (
        <div className="flex animate-pulse items-center justify-center gap-2 rounded-3xl bg-brand-600 p-4 text-center text-xl font-bold text-white shadow-(--shadow-brand)">
          <BellRing size={22} /> {t(lang, "comeNow")}
        </div>
      )}

      {v.askConfirm && (
        <section className="card space-y-3 bg-amber-50 ring-amber-300" data-testid="confirm-box">
          <p className="text-xl font-bold text-amber-900">{v.held ? t(lang, "heldTitle") : t(lang, "stillComing")}</p>
          <p className="text-amber-800">{v.held ? t(lang, "heldHint") : t(lang, "stillComingHint", { n: v.confirmTimeoutMin })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => act("confirm")} disabled={busy}>
              {t(lang, "yesComing")}
            </button>
            <button className="btn-danger" onClick={() => setAskCancel(true)} disabled={busy}>
              {t(lang, "cancelTicket")}
            </button>
          </div>
        </section>
      )}

      {error && <p className="rounded-xl bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700" role="alert">{error}</p>}

      {active && (
        <>
          {/* ——— المراحل ——— */}
          {v.status !== "pending_approval" && v.status !== "deferred" && (
            <section className="card">
              <ol className="relative space-y-4">
                {steps.map(([label, time], i) => {
                  const n = i + 1;
                  const done = n < stage || (n === 4 && stage === 4);
                  const now = n === stage;
                  return (
                    <li key={label} className="relative flex items-center gap-3">
                      {i < steps.length - 1 && (
                        <span className={`absolute top-7 h-[calc(100%-4px)] w-0.5 ltr:left-[13px] rtl:right-[13px] ${n < stage ? "bg-brand-500" : "bg-slate-200"}`} />
                      )}
                      <span
                        className={`relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          done ? "bg-brand-600 text-white" : now ? "bg-brand-100 text-brand-800 ring-2 ring-brand-500" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {done ? "✓" : n}
                      </span>
                      <span className={`flex-1 text-sm ${now ? "font-bold text-ink" : done ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
                      {time && (done || now) && <span className="num text-xs text-slate-400" dir="ltr">{time}</span>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* ——— التنبيهات ——— */}
          <section className="card space-y-3">
            <div className="flex items-center gap-2 font-bold">
              <BellRing size={18} className="text-brand-600" /> {t(lang, "tk_alerts")}
            </div>
            <SoundGate lang={lang} />
            {v.wa.linked ? (
              <p className="flex items-center gap-2 font-semibold text-brand-700">
                <MessageCircle size={18} /> {t(lang, "tk_waOn")}
              </p>
            ) : (
              v.wa.link && (
                <a href={v.wa.link} className="btn w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]" data-testid="wa-alerts">
                  <MessageCircle size={18} /> {t(lang, "tk_waLink")}
                </a>
              )
            )}
            <PushButton lang={lang} ticketId={v.id} pushKey={v.pushKey} />
            <p className="text-sm text-slate-500">{v.arrived ? t(lang, "arrived") : t(lang, "checkInHint")}</p>
            <p className="text-xs text-slate-400">{t(lang, "keepScreenOn")}</p>
          </section>
        </>
      )}

      <ClinicCard lang={lang} name={v.shop.name} kind={v.shop.kind} profile={v.shop.profile} compact={!v.shop.profile.address && !v.shop.profile.phone} />

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={share}>
          <Share2 size={18} /> {copied ? t(lang, "tk_copied") : t(lang, "tk_share")}
        </button>
        {active && !v.askConfirm && v.status !== "called" ? (
          <button className="btn-danger" onClick={() => setAskCancel(true)} disabled={busy}>
            <XCircle size={18} /> {t(lang, "cancelTicket")}
          </button>
        ) : (
          <a className="btn-secondary" href={`/s/${v.shop.slug}?from=ticket`}>
            {t(lang, "backToShop")}
          </a>
        )}
      </div>

      <ConfirmDialog
        open={askCancel}
        title={t(lang, "cancelSure")}
        body={t(lang, "tk_cancelBody")}
        confirmLabel={t(lang, "cancelTicket")}
        cancelLabel={t(lang, "tk_keep")}
        danger
        onConfirm={() => act("cancel")}
        onClose={() => setAskCancel(false)}
        closeLabel={t(lang, "a11y_close")}
      />
    </>
  );
}
