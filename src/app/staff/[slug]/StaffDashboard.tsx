"use client";
import { useEffect, useRef, useState } from "react";
import LangSwitch from "@/components/LangSwitch";
import SoundGate from "@/components/SoundGate";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError, playSound, usePoll } from "@/lib/client";
import type { StaffState } from "@/lib/server/service";

type Row = StaffState["waiting"][number];

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-brand-100 text-brand-900",
    amber: "bg-amber-100 text-amber-900",
    blue: "bg-sky-100 text-sky-900",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export default function StaffDashboard({ lang, slug, initial }: { lang: Lang; slug: string; initial: StaffState }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [online, setOnline] = useState(true);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addPresent, setAddPresent] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newcomer, setNewcomer] = useState<string | null>(null);

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

  async function act(body: Record<string, unknown>, okText?: (r: { number?: number }) => string) {
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
      if (err.code === "conflict") setS(await api<StaffState>(`/api/staff/${slug}/state`).catch(() => s));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const cur = s.current;
  const next = async () => {
    if (await act({ action: "next", current: cur?.id ?? null })) playSound("next");
  };
  const noShow = async () => {
    if (confirm(t(lang, "confirmNoShow")) && (await act({ action: "no_show_next", current: cur?.id ?? null }))) {
      playSound("next");
    }
  };

  const badges = (r: Row) => (
    <span className="flex flex-wrap gap-1">
      {r.arrived && <Badge tone="green">{t(lang, "badgeArrived")}</Badge>}
      {r.held && <Badge tone="amber">{t(lang, "badgeHeld")}</Badge>}
      {!r.arrived && !r.held && r.asked && <Badge tone="amber">{t(lang, "badgeAsked")}</Badge>}
      {!r.arrived && !r.held && r.confirmed && r.source === "online" && <Badge tone="blue">{t(lang, "badgeConfirmed")}</Badge>}
      {r.source === "desk" && <Badge>{t(lang, "badgeDesk")}</Badge>}
    </span>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-brand-700">{t(lang, "appName")}</div>
          <h1 className="text-xl font-extrabold">{s.shop.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-full px-4 py-2 text-sm font-bold ${s.closed ? "bg-red-100 text-red-800" : "bg-brand-100 text-brand-900"}`}
            onClick={() => act({ action: s.closed ? "open" : "close" })}
            disabled={busy}
            title={s.closed ? t(lang, "openQueue") : t(lang, "closeQueue")}
          >
            {s.closed ? `🔒 ${t(lang, "queueIsClosed")} — ${t(lang, "openQueue")}` : `🟢 ${t(lang, "queueIsOpen")} — ${t(lang, "closeQueue")}`}
          </button>
          <SoundGate lang={lang} part="toggle" />
          <LangSwitch lang={lang} />
        </div>
      </header>

      <SoundGate lang={lang} />

      {newcomer && (
        <button
          type="button"
          className="w-full rounded-2xl bg-sky-50 p-3 text-center font-bold text-sky-900 ring-1 ring-sky-200"
          onClick={() => setNewcomer(null)}
          data-testid="newcomer"
        >
          {newcomer} ✕
        </button>
      )}

      {!online && <div className="rounded-xl bg-slate-800 p-2 text-center text-sm text-white">{t(lang, "offline")}</div>}
      {!s.shop.active ? (
        <div className="rounded-xl bg-red-50 p-3 font-semibold text-red-800 ring-1 ring-red-200">{t(lang, "subscriptionExpired")}</div>
      ) : (
        !s.shop.paidUntil && (
          <div className="text-sm text-slate-500">
            {t(lang, "trialEnds", { d: new Date(s.shop.trialEndsAt).toLocaleDateString(lang === "ar" ? "ar-DZ" : "fr-DZ") })}
          </div>
        )
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* ——— الحالي + الأزرار ——— */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-500">{t(lang, "current")}</h2>
            {cur && <span className="num text-sm text-slate-500">{cur.minutes} {t(lang, "minutes")}</span>}
          </div>
          {cur ? (
            <div className="flex items-center gap-4">
              <div className="num text-7xl font-black leading-none" data-testid="current-number">{cur.number}</div>
              <div className="min-w-0 space-y-1">
                <div className="truncate text-2xl font-bold">{cur.name}</div>
                <div className="num text-slate-500" dir="ltr">{cur.phone}</div>
                {badges(cur)}
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-xl text-slate-400" data-testid="current-number">{t(lang, "nobodyCalled")}</p>
          )}

          <button
            className="btn-primary w-full py-6 text-3xl"
            onClick={next}
            disabled={busy || (!cur && s.waiting.every((w) => w.held))}
            data-testid="next"
          >
            {cur ? t(lang, "next") : t(lang, "callFirst")} {lang === "ar" ? "←" : "→"}
          </button>
          {cur && (
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-warn px-2 text-base" onClick={noShow} disabled={busy} data-testid="no-show">
                {t(lang, "noShowNext")}
              </button>
              <button
                className="btn-secondary px-2 text-base"
                onClick={() => act({ action: "arrived", ticketId: cur.id })}
                disabled={busy || cur.arrived}
              >
                {t(lang, "markArrived")}
              </button>
              <button className="btn-secondary px-2 text-base" onClick={() => act({ action: "recall" })} disabled={busy}>
                {t(lang, "recall")}
              </button>
            </div>
          )}
          {msg && (
            <p className={`text-center font-semibold ${msg.ok ? "text-brand-700" : "text-red-700"}`} role="status">
              {msg.text}
            </p>
          )}
        </section>

        {/* ——— إضافة شخص + إحصاءات ——— */}
        <div className="space-y-4">
          <section className="card space-y-3">
            <button className="flex w-full items-center justify-between text-start" onClick={() => setShowAdd((x) => !x)}>
              <span>
                <span className="block text-lg font-extrabold">＋ {t(lang, "addPerson")}</span>
                <span className="text-sm text-slate-500">{t(lang, "addPersonHint")}</span>
              </span>
              <span className="text-2xl text-slate-400">{showAdd ? "−" : "+"}</span>
            </button>
            {showAdd && (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await act(
                    { action: "add", name: addName, phone: addPhone || undefined, present: addPresent },
                    (r) => t(lang, "added", { n: r.number ?? "" }),
                  );
                  if (ok) {
                    setAddName("");
                    setAddPhone("");
                  }
                }}
              >
                <input className="input" placeholder={t(lang, "name")} value={addName} onChange={(e) => setAddName(e.target.value)} required minLength={2} data-testid="add-name" />
                <input className="input num" dir="ltr" type="tel" placeholder={t(lang, "phoneOptional")} value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" className="size-5" checked={addPresent} onChange={(e) => setAddPresent(e.target.checked)} />
                  {t(lang, "presentNow")}
                </label>
                <button className="btn-primary w-full" disabled={busy}>{t(lang, "add")}</button>
              </form>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-extrabold">{t(lang, "todayStats")}</h2>
            <dl className="grid grid-cols-2 gap-3 text-center">
              {[
                [t(lang, "served"), s.stats.served],
                [t(lang, "noShows"), s.stats.noShows],
                [t(lang, "avgService"), s.stats.avgServiceMin !== null ? `${s.stats.avgServiceMin} ${t(lang, "minutes")}` : "—"],
                [t(lang, "avgWait"), s.stats.avgWaitMin !== null ? `${s.stats.avgWaitMin} ${t(lang, "minutes")}` : "—"],
              ].map(([k, val]) => (
                <div key={String(k)} className="rounded-2xl bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="num text-xl font-black">{val}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {s.pending.length > 0 && (
        <section className="card space-y-2 ring-amber-300">
          <h2 className="font-extrabold text-amber-900">
            {t(lang, "approvals")} <span className="text-sm font-normal">— {t(lang, "approvalsHint", { n: s.shop.noShowLimit })}</span>
          </h2>
          {s.pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-3">
              <span className="num text-2xl font-black">{r.number}</span>
              <span className="flex-1 font-semibold">
                {r.name} <span className="num text-sm text-slate-500" dir="ltr">{r.phone}</span>{" "}
                <Badge tone="amber">{t(lang, "badgeNoShows", { n: r.noShows })}</Badge>
              </span>
              <button className="btn-primary px-4 py-2 text-base" onClick={() => act({ action: "approve", ticketId: r.id })} disabled={busy}>
                {t(lang, "approve")}
              </button>
              <button className="btn-danger px-4 py-2 text-base" onClick={() => act({ action: "reject", ticketId: r.id })} disabled={busy}>
                {t(lang, "reject")}
              </button>
            </div>
          ))}
        </section>
      )}

      {s.deferred.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-extrabold text-amber-800">{t(lang, "deferredList")}</h2>
          {s.deferred.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <span className="num text-2xl font-black text-slate-500">{r.number}</span>
              <span className="flex-1 font-semibold">{r.name}</span>
              <Badge tone="amber">{t(lang, "minutesLeft", { n: r.minutesLeft })}</Badge>
              <button className="btn-secondary px-4 py-2 text-base" onClick={() => act({ action: "arrived", ticketId: r.id })} disabled={busy}>
                {t(lang, "returned")}
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-extrabold">
          {t(lang, "queue")} <span className="num text-slate-400">({s.waiting.length})</span>
        </h2>
        {s.waiting.length === 0 ? (
          <p className="py-6 text-center text-slate-400">{t(lang, "emptyQueue")}</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="queue">
            {s.waiting.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 py-2 ${r.held ? "opacity-60" : ""}`}>
                <span className="num w-12 text-center text-2xl font-black">{r.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {r.phone && <span className="num text-sm text-slate-500" dir="ltr">{r.phone}</span>}
                    {badges(r)}
                  </span>
                </span>
                {!r.arrived && (
                  <button className="rounded-xl px-3 py-2 text-sm font-bold text-brand-700 ring-1 ring-brand-500" onClick={() => act({ action: "arrived", ticketId: r.id })} disabled={busy}>
                    {t(lang, "markArrived")}
                  </button>
                )}
                <button
                  className="rounded-xl px-3 py-2 text-sm font-bold text-red-700 ring-1 ring-red-300"
                  onClick={() => confirm(`${t(lang, "cancel")} ${r.number}?`) && act({ action: "cancel", ticketId: r.id })}
                  disabled={busy}
                >
                  {t(lang, "cancel")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.history.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-extrabold">{t(lang, "last7")}</h2>
          <table className="num w-full text-center text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="p-1 text-start">{t(lang, "day")}</th>
                <th className="p-1">{t(lang, "total")}</th>
                <th className="p-1">{t(lang, "served")}</th>
                <th className="p-1">{t(lang, "noShows")}</th>
                <th className="p-1">{t(lang, "avgWait")}</th>
              </tr>
            </thead>
            <tbody>
              {s.history.map((h) => (
                <tr key={h.day} className="border-t border-slate-100">
                  <td className="p-1 text-start"><span dir="ltr">{h.day}</span></td>
                  <td className="p-1">{h.total}</td>
                  <td className="p-1">{h.served}</td>
                  <td className="p-1">{h.noShows}</td>
                  <td className="p-1">{h.avgWaitMin ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <nav className="flex flex-wrap justify-center gap-2 pb-6">
        <a className="btn-secondary text-base" href={`/staff/${slug}/qr`}>{t(lang, "printQr")}</a>
        <a className="btn-secondary text-base" href={`/d/${slug}`} target="_blank">{t(lang, "display")}</a>
        <a className="btn-secondary text-base" href={`/staff/${slug}/settings`}>{t(lang, "settings")}</a>
        <button
          className="btn-secondary text-base"
          onClick={async () => {
            await api(`/api/staff/${slug}/logout`, {});
            location.reload();
          }}
        >
          {t(lang, "logout")}
        </button>
      </nav>
    </main>
  );
}
