"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Ban, Bell, CheckCheck, Clock3, Copy, Hourglass, Keyboard, Link2, Mail, Phone, Plus, ShieldAlert, Smartphone, Timer, UserCheck, UserPlus, UserRoundX, Users, WifiOff, X } from "lucide-react";
import Dialog, { ConfirmDialog } from "@/components/Dialog";
import SoundGate from "@/components/SoundGate";
import { Avatar, Chip, Empty, LiveDot, Stat } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { errorText, t, tn } from "@/lib/i18n";
import { api, ApiError, playSound, usePoll } from "@/lib/client";
import type { StaffState } from "@/lib/server/service";
import TodayAppointments, { ApptBadge } from "./appointments/TodayAppointments";

type Row = StaffState["waiting"][number];
type Confirm = { kind: "noshow"; id: string; number: number } | { kind: "cancel"; id: string; number: number } | null;

/** canManage: الطبيب أو مدير العيادة. السكرتيرة لا ترى روابط الاشتراك والإعدادات (لا تستطيع فتحها). */
export default function StaffDashboard({ lang, slug, initial, canManage = true }: { lang: Lang; slug: string; initial: StaffState; canManage?: boolean }) {
  const billingLink = (children: React.ReactNode) => (canManage ? <a href={`/staff/${slug}/billing`}>{children}</a> : children);
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [online, setOnline] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addPresent, setAddPresent] = useState(true);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [newcomer, setNewcomer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stopAsk, setStopAsk] = useState(false);
  const [notice, setNotice] = useState<{ text: string; stop: boolean } | null>(null);
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  usePoll(async () => {
    try {
      setS(await api<StaffState>(`/api/staff/${slug}/state`));
      setOnline(true);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) location.reload();
      if (err.code === "network") setOnline(false);
    }
  }, 4000);

  // زبون جديد أخذ رقماً من هاتفه ← صوت + رسالة. (من تضيفه السكرتيرة بنفسها لا يُصدر صوتاً)
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const all = [...s.waiting, ...s.pending, ...(s.current ? [s.current] : []), ...s.deferred];
    if (known.current) {
      const fresh = all.filter((r) => !known.current!.has(r.id) && r.source === "online");
      if (fresh.length) {
        playSound("new");
        const last = fresh[fresh.length - 1];
        setNewcomer(t(lang, "newCustomer", { n: last.number, name: last.name }));
      }
    }
    known.current = new Set([...(known.current ?? []), ...all.map((r) => r.id)]);
  }, [s, lang]);
  useEffect(() => {
    if (!newcomer) return;
    const id = setTimeout(() => setNewcomer(null), 8000);
    return () => clearTimeout(id);
  }, [newcomer]);

  // الاستقبال أُوقف أو فُتح من جهاز آخر (الطبيب من مكتبه) ← صوت + تنبيه على شاشة السكرتيرة
  const lastClosed = useRef(initial.closed);
  const myToggle = useRef<boolean | null>(null);
  useEffect(() => {
    if (s.closed === lastClosed.current) return;
    lastClosed.current = s.closed;
    const mine = myToggle.current === s.closed;
    myToggle.current = null;
    if (mine) return;
    playSound(s.closed ? "next" : "moved");
    const by = s.closed && s.closedBy ? ` — ${t(lang, `db_by_${s.closedBy}`)}` : "";
    setNotice({ text: t(lang, s.closed ? "db_remoteStopped" : "db_remoteOpened") + by, stop: s.closed });
  }, [s.closed, s.closedBy, lang]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(id);
  }, [notice]);

  const act = useCallback(
    async (body: Record<string, unknown>, okText?: (r: { number?: number }) => string) => {
      setBusy(true);
      setMsg(null);
      try {
        const r = await api<{ result: { number?: number }; state: StaffState }>(`/api/staff/${slug}/action`, body);
        setS(r.state);
        if (okText) setMsg({ text: okText(r.result), ok: true });
        return true;
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) location.reload();
        setMsg({ text: errorText(lang, err.code), ok: false });
        if (err.code === "conflict") api<StaffState>(`/api/staff/${slug}/state`).then(setS).catch(() => {});
        return false;
      } finally {
        setBusy(false);
      }
    },
    [slug, lang],
  );

  const cur = s.current;
  const upNext = s.waiting.find((w) => !w.held) ?? null;
  const canNext = Boolean(cur || upNext);

  const setAccepting = (open: boolean) => {
    myToggle.current = !open;
    setNotice(null);
    return act({ action: open ? "open" : "close" });
  };
  const closedSince =
    s.closed && s.closedAt
      ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s.closedAt))
      : null;

  const next = useCallback(async () => {
    if (await act({ action: "next", current: s.current?.id ?? null })) playSound("next");
  }, [act, s.current?.id]);

  // اختصارات لوحة المفاتيح: N = التالي، A = إضافة شخص (حسب موضع الزرّ، تعمل بكلّ اللغات)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || document.querySelector("dialog[open]")) return;
      if (e.code === "KeyN" && canNext && !busy) {
        e.preventDefault();
        next();
      } else if (e.code === "KeyA") {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, busy, next]);

  // يُحسب بعد التركيب (لا قراءة لـ location أثناء العرض ← لا اختلاف بين الخادم والمتصفّح)
  const [patientUrl, setPatientUrl] = useState(`/s/${slug}`);
  useEffect(() => setPatientUrl(`${location.origin}/s/${slug}`), [slug]);

  const badges = (r: Row | NonNullable<StaffState["current"]>) => (
    <span className="flex flex-wrap gap-1">
      {r.priority && <ApptBadge lang={lang} />}
      {r.arrived && (
        <Chip tone="green">
          <UserCheck size={12} /> {t(lang, "badgeArrived")}
        </Chip>
      )}
      {r.held && <Chip tone="amber">{t(lang, "badgeHeld")}</Chip>}
      {!r.arrived && !r.held && r.asked && <Chip tone="amber">{t(lang, "badgeAsked")}</Chip>}
      {!r.arrived && !r.held && r.confirmed && r.source === "online" && <Chip tone="sky">{t(lang, "badgeConfirmed")}</Chip>}
      {r.source === "desk" && <Chip>{t(lang, "badgeDesk")}</Chip>}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* ——— شريط الحالة ——— */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={!s.closed}
          onClick={() => (s.closed ? setAccepting(true) : setStopAsk(true))}
          data-testid="accepting-switch"
          disabled={busy}
          className={`inline-flex items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-4 text-sm font-semibold ring-1 transition ${
            s.closed ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-brand-50 text-brand-800 ring-brand-200"
          }`}
        >
          <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${s.closed ? "bg-slate-300" : "bg-brand-500"}`}>
            <span className={`absolute size-5 rounded-full bg-white shadow transition-all ${s.closed ? "ltr:left-0.5 rtl:right-0.5" : "ltr:left-[22px] rtl:right-[22px]"}`} />
          </span>
          {s.closed ? t(lang, "db_stopped") : t(lang, "db_accepting")}
        </button>
        <Chip>
          <Clock3 size={12} />
          <span dir="ltr" className="num">
            {s.hoursToday.length ? s.hoursToday.map(([a, b]) => `${a}–${b}`).join(" · ") : t(lang, "closedToday")}
          </span>
        </Chip>
        {s.blocker === "outside_hours" && !s.closed && <Chip tone="amber">{t(lang, "outsideHours")}</Chip>}
        {s.blocker === "day_off" &&
          (canManage ? (
            <a href={`/staff/${slug}/settings#daysoff`}>
              <Chip tone="amber">{t(lang, "db_dayOffChip")}</Chip>
            </a>
          ) : (
            <Chip tone="amber">{t(lang, "db_dayOffChip")}</Chip>
          ))}
        {s.shop.clinic?.covers ? (
          // مشمول باشتراك العيادة متعدّدة الأطبّاء: لا عدّاد تجربة خاصّ
          billingLink(<Chip tone="green">{t(lang, "cb_dbCovered")}</Chip>)
        ) : (
          !(s.shop.paidUntil && new Date(s.shop.paidUntil) > new Date(s.serverTime)) &&
          s.shop.active && (
            billingLink(
              <Chip tone="violet">
                {tn(lang, "db_trialLeft", Math.max(0, Math.ceil((new Date(s.shop.until).getTime() - new Date(s.serverTime).getTime()) / 86_400_000)))}
              </Chip>,
            )
          )
        )}
        <span className="ms-auto flex items-center gap-2">
          {!online && (
            <Chip tone="rose">
              <WifiOff size={12} /> {t(lang, "offline")}
            </Chip>
          )}
          <SoundGate lang={lang} part="toggle" />
        </span>
      </div>

      {s.closed && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200" role="status" data-testid="stopped-banner">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
            <Ban size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t(lang, "db_stoppedBanner")}</p>
            <p className="text-sm text-rose-800/80">
              {closedSince && (
                <>
                  {t(lang, "db_stoppedSince", { time: closedSince })}
                  {s.closedBy && ` · ${t(lang, `db_by_${s.closedBy}`)}`}
                  {" — "}
                </>
              )}
              {t(lang, "db_stoppedKeep")}
            </p>
          </div>
          <button type="button" className="btn bg-white text-rose-800 ring-1 ring-rose-300 hover:bg-rose-100" onClick={() => setAccepting(true)} disabled={busy}>
            {t(lang, "db_reopen")}
          </button>
        </div>
      )}
      {!s.shop.active && (
        <a
          href={canManage ? `/staff/${slug}/billing` : undefined}
          className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 font-semibold text-rose-800 ring-1 ring-rose-200"
        >
          <ShieldAlert size={20} /> {s.shop.clinic ? t(lang, "cb_dbClinicExpired", { name: s.shop.clinic.name }) : t(lang, "subscriptionExpired")}
        </a>
      )}
      {!s.shop.hasEmail && canManage && (
        <a
          href={`/staff/${slug}/settings#security`}
          className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"
          data-testid="no-email"
        >
          <Mail size={18} className="shrink-0" />
          <span className="flex-1">{t(lang, "db_noEmail")}</span>
          <span className="shrink-0 underline">{t(lang, "db_addEmail")}</span>
        </a>
      )}
      <div className="max-w-xl">
        <SoundGate lang={lang} />
      </div>

      {notice && (
        <button
          type="button"
          className={`fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl p-4 text-start text-white shadow-(--shadow-lift) ${notice.stop ? "bg-rose-700" : "bg-brand-700"}`}
          onClick={() => setNotice(null)}
          data-testid="accepting-notice"
        >
          <span className="flex-1 font-semibold">{notice.text}</span>
          <X size={18} className="opacity-60" />
        </button>
      )}
      {newcomer && !notice && (
        <button
          type="button"
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-ink p-4 text-start text-white shadow-(--shadow-lift)"
          onClick={() => setNewcomer(null)}
          data-testid="newcomer"
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-500">
            <Bell size={18} />
          </span>
          <span className="flex-1 font-semibold">{newcomer}</span>
          <X size={18} className="opacity-60" />
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* ——— العمود الرئيسي ——— */}
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-ink to-slate-800 p-5 text-white shadow-(--shadow-lift) sm:p-6">
            <div className="absolute -top-20 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl ltr:-right-16 rtl:-left-16" />
            <div className="relative flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <LiveDot on={Boolean(cur)} /> {t(lang, "db_inside")}
              </span>
              {cur && (
                <span className="num flex items-center gap-1 text-sm text-slate-400">
                  <Timer size={14} /> {t(lang, "sp_min", { n: cur.minutes })}
                </span>
              )}
            </div>

            {cur ? (
              <div className="relative mt-3 flex items-center gap-5">
                <div key={cur.id} className="num animate-pop text-8xl leading-none font-bold" data-testid="current-number">
                  {cur.number}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="truncate text-2xl font-bold">{cur.name}</div>
                  {cur.phone && (
                    <div className="num flex items-center gap-1.5 text-slate-300" dir="ltr">
                      <Phone size={14} /> {cur.phone}
                    </div>
                  )}
                  {badges(cur)}
                </div>
              </div>
            ) : (
              <p className="relative py-6 text-center text-xl text-slate-400" data-testid="current-number">
                {t(lang, "nobodyCalled")}
              </p>
            )}

            <button
              className="btn relative mt-5 h-16 w-full bg-brand-600 text-2xl text-white shadow-(--shadow-brand) hover:bg-brand-700 focus-visible:ring-brand-300"
              onClick={next}
              disabled={busy || !canNext}
              data-testid="next"
            >
              {cur ? t(lang, "next") : t(lang, "callFirst")} <Arrow size={26} />
            </button>
            {upNext && (
              <p className="relative mt-2.5 text-center text-sm text-slate-400">
                {t(lang, "db_upNext")}: <b className="num text-slate-200">{upNext.number}</b> — {upNext.name}
                {upNext.arrived ? ` · ${t(lang, "badgeArrived")} ✓` : ""}
              </p>
            )}

            {cur && (
              <div className="relative mt-4 grid grid-cols-3 gap-2">
                <button
                  className="btn btn-sm h-14 flex-col gap-0.5 bg-amber-400 px-1 text-xs leading-tight whitespace-nowrap text-amber-950 hover:bg-amber-300 sm:h-11 sm:flex-row sm:gap-1.5 sm:text-sm"
                  onClick={() => setConfirm({ kind: "noshow", id: cur.id, number: cur.number })}
                  disabled={busy}
                  data-testid="no-show"
                >
                  <UserRoundX size={16} /> {t(lang, "db_absent")}
                </button>
                <button
                  className="btn btn-sm h-14 flex-col gap-0.5 bg-white/10 px-1 text-xs leading-tight whitespace-nowrap text-white ring-1 ring-white/15 hover:bg-white/20 sm:h-11 sm:flex-row sm:gap-1.5 sm:text-sm"
                  onClick={() => act({ action: "arrived", ticketId: cur.id })}
                  disabled={busy || cur.arrived}
                >
                  <UserCheck size={16} /> {t(lang, "markArrived")}
                </button>
                <button
                  className="btn btn-sm h-14 flex-col gap-0.5 bg-white/10 px-1 text-xs leading-tight whitespace-nowrap text-white ring-1 ring-white/15 hover:bg-white/20 sm:h-11 sm:flex-row sm:gap-1.5 sm:text-sm"
                  onClick={() => act({ action: "recall" }, () => t(lang, "db_recalled"))}
                  disabled={busy}
                >
                  <Bell size={16} /> {t(lang, "recall")}
                </button>
              </div>
            )}
            {msg && (
              <p className={`relative mt-3 text-center text-sm font-semibold ${msg.ok ? "text-brand-300" : "text-rose-300"}`} role="status">
                {msg.text}
              </p>
            )}
            <p className="relative mt-3 hidden items-center justify-center gap-1.5 text-xs text-slate-400 lg:flex">
              <Keyboard size={13} /> {t(lang, "db_shortcuts")}
            </p>
          </section>

          {/* ——— الطابور ——— */}
          <section className="card p-0">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h2 className="flex items-center gap-2 font-bold">
                <Users size={18} className="text-brand-600" /> {t(lang, "queue")}
                <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.waiting.length}</span>
              </h2>
              <button className="btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
                <UserPlus size={16} /> {t(lang, "addPerson")}
              </button>
            </div>
            {s.waiting.length === 0 ? (
              <Empty icon={<Users size={40} />} title={t(lang, "emptyQueue")} sub={t(lang, "db_emptyHint")} />
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="queue">
                {s.waiting.map((r, i) => (
                  <li key={r.id} className={`flex items-center gap-3 px-5 py-3 ${r.held ? "opacity-55" : ""} ${i === 0 && !r.held ? "bg-brand-50/50" : ""}`}>
                    <span className="num w-9 text-center text-xl font-bold text-ink">{r.number}</span>
                    <Avatar name={r.name} size={36} tone={r.source === "desk" ? "slate" : "green"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.phone && (
                          <span className="num text-xs text-slate-500" dir="ltr">
                            {r.phone}
                          </span>
                        )}
                        {badges(r)}
                      </span>
                    </span>
                    {r.eta !== null && (
                      <span className="num hidden text-xs whitespace-nowrap text-slate-500 sm:inline">≈ {t(lang, "sp_min", { n: r.eta })}</span>
                    )}
                    <span className="flex shrink-0 gap-2">
                      {!r.arrived && (
                        <button
                          className="inline-flex size-10 items-center justify-center rounded-xl text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                          onClick={() => act({ action: "arrived", ticketId: r.id })}
                          disabled={busy}
                          title={t(lang, "markArrived")}
                          aria-label={`${t(lang, "markArrived")} ${r.number}`}
                        >
                          <UserCheck size={17} />
                        </button>
                      )}
                      <button
                        className="inline-flex size-10 items-center justify-center rounded-xl text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
                        onClick={() => setConfirm({ kind: "cancel", id: r.id, number: r.number })}
                        disabled={busy}
                        title={t(lang, "cancel")}
                        aria-label={`${t(lang, "cancel")} ${r.number}`}
                      >
                        <X size={17} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ——— العمود الجانبي ——— */}
        <div className="space-y-4">
          <TodayAppointments lang={lang} slug={slug} onQueueChange={() => api<StaffState>(`/api/staff/${slug}/state`).then(setS).catch(() => {})} />
          <section className="grid grid-cols-2 gap-2.5">
            <Stat icon={<Users size={13} />} label={t(lang, "waitingCount")} value={s.waiting.filter((w) => !w.held).length} />
            <Stat icon={<CheckCheck size={13} />} label={t(lang, "served")} value={s.stats.served} />
            <Stat icon={<UserRoundX size={13} />} label={t(lang, "noShows")} value={s.stats.noShows} />
            <Stat
              icon={<Hourglass size={13} />}
              label={t(lang, "avgWait")}
              value={s.stats.avgWaitMin !== null ? t(lang, "sp_min", { n: s.stats.avgWaitMin }) : "—"}
            />
          </section>

          {s.pending.length > 0 && (
            <section className="card space-y-3 ring-amber-300">
              <h2 className="flex items-center gap-2 font-bold text-amber-900">
                <ShieldAlert size={18} /> {t(lang, "approvals")}
              </h2>
              <p className="text-xs text-amber-800">{t(lang, "approvalsHint", { n: s.shop.noShowLimit })}</p>
              {s.pending.map((r) => (
                <div key={r.id} className="rounded-2xl bg-amber-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="num text-xl font-bold">{r.number}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    <Chip tone="amber">{t(lang, "badgeNoShows", { n: r.noShows })}</Chip>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button className="btn-primary btn-sm" onClick={() => act({ action: "approve", ticketId: r.id })} disabled={busy}>
                      {t(lang, "approve")}
                    </button>
                    <button className="btn-danger btn-sm" onClick={() => act({ action: "reject", ticketId: r.id })} disabled={busy}>
                      {t(lang, "reject")}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {s.deferred.length > 0 && (
            <section className="card space-y-2">
              <h2 className="flex items-center gap-2 font-bold text-amber-800">
                <Hourglass size={18} /> {t(lang, "deferredList")}
              </h2>
              {s.deferred.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <span className="num text-xl font-bold text-slate-500">{r.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="text-xs text-amber-700">{t(lang, "minutesLeft", { n: r.minutesLeft })}</span>
                  </span>
                  <button className="btn-secondary btn-sm" onClick={() => act({ action: "arrived", ticketId: r.id })} disabled={busy}>
                    <UserCheck size={15} /> {t(lang, "returned")}
                  </button>
                </div>
              ))}
            </section>
          )}

          <section className="card space-y-3">
            <h2 className="flex items-center gap-2 font-bold">
              <Link2 size={18} className="text-brand-600" /> {t(lang, "db_patientLink")}
            </h2>
            <p className="text-sm text-slate-600">{t(lang, "db_patientLinkHint")}</p>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2 ps-3 ring-1 ring-slate-200" dir="ltr">
              <Smartphone size={16} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{patientUrl.replace(/^https?:\/\//, "")}</span>
              <button
                className="btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(patientUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
              >
                <Copy size={14} /> {copied ? "✓" : t(lang, "db_copy")}
              </button>
            </div>
            <a
              className="btn btn-sm w-full bg-[#128C7E] text-white hover:bg-[#0e6f64]"
              href={`https://wa.me/?text=${encodeURIComponent(`${t(lang, "db_waShare")} ${patientUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(lang, "db_shareWa")}
            </a>
          </section>

          {!s.shop.profileComplete && (
            <a href={`/staff/${slug}/settings#profile`} className="card flex items-center gap-3 bg-sky-50 ring-sky-200 transition hover:bg-sky-100">
              <Plus size={20} className="text-sky-700" />
              <span className="text-sm font-semibold text-sky-900">{t(lang, "db_completeProfile")}</span>
            </a>
          )}
        </div>
      </div>

      {/* ——— إضافة شخص ——— */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={t(lang, "addPerson")} closeLabel={t(lang, "a11y_close")}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(
              { action: "add", name: addName, phone: addPhone || undefined, present: addPresent },
              (r) => t(lang, "added", { n: r.number ?? "" }),
            );
            if (ok) {
              setAddName("");
              setAddPhone("");
              setAddOpen(false);
            }
          }}
        >
          <p className="text-sm text-slate-600">{t(lang, "addPersonHint")}</p>
          <div>
            <label className="label" htmlFor="add-name">{t(lang, "name")}</label>
            <input id="add-name" className="input" value={addName} onChange={(e) => setAddName(e.target.value)} required minLength={2} data-testid="add-name" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="add-phone">{t(lang, "phoneOptional")}</label>
            <input id="add-phone" className="input num text-start" dir="ltr" type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="0550 12 34 56" />
            <p className="mt-1.5 text-xs text-slate-500">{t(lang, "db_addPhoneHint")}</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-slate-700">
            <input type="checkbox" className="size-5 accent-brand-600" checked={addPresent} onChange={(e) => setAddPresent(e.target.checked)} />
            {t(lang, "presentNow")}
          </label>
          {msg && !msg.ok && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{msg.text}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            <UserPlus size={18} /> {t(lang, "add")}
          </button>
        </form>
      </Dialog>

      <ConfirmDialog
        open={stopAsk}
        title={t(lang, "db_stopTitle")}
        body={t(lang, "db_stopBody")}
        confirmLabel={t(lang, "db_stopConfirm")}
        cancelLabel={t(lang, "db_back")}
        danger
        onConfirm={() => setAccepting(false)}
        onClose={() => setStopAsk(false)}
        closeLabel={t(lang, "a11y_close")}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "noshow"
            ? `${t(lang, "confirmNoShow")} (${confirm.number})`
            : `${t(lang, "cancel")} ${confirm?.kind === "cancel" ? confirm.number : ""}${lang === "ar" ? "؟" : " ?"}`
        }
        body={confirm?.kind === "noshow" ? t(lang, "db_noShowBody") : t(lang, "db_cancelBody")}
        confirmLabel={confirm?.kind === "noshow" ? t(lang, "noShowNext") : t(lang, "cancel")}
        cancelLabel={t(lang, "db_back")}
        danger={confirm?.kind === "cancel"}
        onConfirm={async () => {
          if (confirm?.kind === "noshow") {
            if (await act({ action: "no_show_next", current: confirm.id })) playSound("next");
          } else if (confirm?.kind === "cancel") {
            act({ action: "cancel", ticketId: confirm.id });
          }
        }}
        onClose={() => setConfirm(null)}
        closeLabel={t(lang, "a11y_close")}
      />
    </div>
  );
}
