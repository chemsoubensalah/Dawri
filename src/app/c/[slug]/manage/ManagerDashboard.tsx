"use client";
import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  DoorOpen,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  MonitorPlay,
  Pencil,
  Plus,
  QrCode,
  UserMinus,
  Users,
} from "lucide-react";
import LangSwitch from "@/components/LangSwitch";
import Dialog from "@/components/Dialog";
import { Chip, LogoMark } from "@/components/ui";
import type { Lang } from "@/lib/domain/types";
import { themeVars } from "@/lib/theme";
import { dirOf, drTitle, errorText, t, tn } from "@/lib/i18n";
import { api, ApiError, usePoll } from "@/lib/client";
import type { ManagerView } from "@/lib/server/clinics";
import { StatusBadge } from "../status";

type Doctor = ManagerView["doctors"][number];
type Modal = null | { kind: "add" } | { kind: "join" } | { kind: "room"; doctor: Doctor } | { kind: "remove"; doctor: Doctor } | { kind: "pin" };

const KINDS = ["doctor", "dentist", "lab", "other"] as const;

function suggestSlug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** لوحة مدير العيادة: بطاقة حيّة لكلّ طبيب + إدارة الأطبّاء. */
export default function ManagerDashboard({ lang, initial }: { lang: Lang; initial: ManagerView }) {
  const [view, setView] = useState(initial);
  const [modal, setModal] = useState<Modal>(null);
  const slug = initial.clinic.slug;
  const refresh = async () => setView(await api<ManagerView>(`/api/c/${slug}/manage`));
  usePoll(async () => {
    try {
      await refresh();
    } catch (e) {
      if ((e as ApiError).status === 401) location.reload();
    }
  }, 5000);
  const full = view.doctors.length >= view.clinic.maxDoctors;

  return (
    <div className="min-h-dvh bg-[#f3f5f8]" dir={dirOf(lang)} lang={lang} style={themeVars(view.clinic.look)}>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={34} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-bold text-ink">{view.clinic.name}</span>
              <span className="block text-xs text-slate-500">{t(lang, "cl_roleManager")}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LangSwitch lang={lang} className="hidden sm:inline-flex" />
            <Link href={`/c/${slug}/manage/billing`} className="btn-ghost btn-sm" data-testid="clinic-billing-link">
              <CreditCard size={16} /> <span className="hidden sm:inline">{t(lang, "cb_button")}</span>
            </Link>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ kind: "pin" })} aria-label={t(lang, "cl_changePin")}>
              <KeyRound size={16} />
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={async () => {
                await api(`/api/c/${slug}/logout`, {}).catch(() => {});
                location.reload();
              }}
            >
              <LogOut size={16} /> <span className="hidden sm:inline">{t(lang, "logout")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-5 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{t(lang, "cl_dashTitle")}</h1>
              <SubscriptionChip lang={lang} slug={slug} sub={view.subscription} />
            </div>
            <p className="text-sm text-slate-600">{t(lang, "cl_dashSub")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/c/${slug}/tv`} target="_blank" rel="noopener" className="btn-secondary btn-sm">
              <MonitorPlay size={16} /> {t(lang, "cl_tv")}
            </a>
            <Link href={`/c/${slug}/qr`} className="btn-secondary btn-sm">
              <QrCode size={16} /> {t(lang, "cl_poster")}
            </Link>
            <a href={`/c/${slug}`} target="_blank" rel="noopener" className="btn-secondary btn-sm">
              <ExternalLink size={16} /> {t(lang, "cl_publicPage")}
            </a>
          </div>
        </div>

        {!view.subscription.active && (
          <Link href={`/c/${slug}/manage/billing`} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 font-semibold text-rose-800 ring-1 ring-rose-200">
            <CreditCard size={20} /> {t(lang, "cb_expiredNote")}
          </Link>
        )}

        {view.doctors.length === 0 ? (
          <div className="card p-8 text-center">
            <Users size={32} className="mx-auto text-slate-400" />
            <p className="mt-3 font-semibold">{t(lang, "cl_noDoctors")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {view.doctors.map((d) => (
              <DoctorCard key={d.slug} lang={lang} clinicSlug={slug} d={d} onRoom={() => setModal({ kind: "room", doctor: d })} onRemove={() => setModal({ kind: "remove", doctor: d })} />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={full} onClick={() => setModal({ kind: "add" })} data-testid="add-doctor">
            <Plus size={18} /> {t(lang, "cl_addDoctor")}
          </button>
          <button type="button" className="btn-secondary" disabled={full} onClick={() => setModal({ kind: "join" })}>
            <Link2 size={18} /> {t(lang, "cl_joinDoctor")}
          </button>
          {full && <p className="self-center text-sm text-slate-500">{t(lang, "err_clinic_full")}</p>}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">{t(lang, "cl_billingNote", { max: view.clinic.maxDoctors })}</p>
      </main>

      <AddDialog lang={lang} slug={slug} open={modal?.kind === "add"} onClose={() => setModal(null)} onDone={refresh} />
      <JoinDialog lang={lang} slug={slug} open={modal?.kind === "join"} onClose={() => setModal(null)} onDone={refresh} />
      {modal?.kind === "room" && <RoomDialog lang={lang} slug={slug} doctor={modal.doctor} onClose={() => setModal(null)} onDone={refresh} />}
      {modal?.kind === "remove" && <RemoveDialog lang={lang} slug={slug} doctor={modal.doctor} onClose={() => setModal(null)} onDone={refresh} />}
      <PinDialog lang={lang} slug={slug} open={modal?.kind === "pin"} onClose={() => setModal(null)} />
    </div>
  );
}

/** «تجربة مجّانية: N يوماً» / «مدفوع حتى …» / «منتهٍ» — يفتح صفحة اشتراك العيادة. */
function SubscriptionChip({ lang, slug, sub }: { lang: Lang; slug: string; sub: ManagerView["subscription"] }) {
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-DZ", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" });
  return (
    <Link href={`/c/${slug}/manage/billing`} data-testid="clinic-sub-chip">
      <Chip tone={sub.paidUntil ? "green" : sub.trial ? "violet" : "rose"}>
        <CreditCard size={12} />
        {sub.paidUntil
          ? t(lang, "cb_chipPaid", { d: fmt.format(new Date(sub.paidUntil)) })
          : sub.trial
            ? tn(lang, "cb_chipTrial", sub.daysLeft)
            : t(lang, "cb_chipExpired")}
      </Chip>
    </Link>
  );
}

function DoctorCard({ lang, clinicSlug, d, onRoom, onRemove }: { lang: Lang; clinicSlug: string; d: Doctor; onRoom: () => void; onRemove: () => void }) {
  const title = drTitle(lang, d.kind, d.doctorName) ?? d.name;
  const sub = d.subscription;
  return (
    <article className="card flex flex-col p-4" data-testid="manager-doctor">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 leading-relaxed">
          <p className="truncate text-lg font-bold">{title}</p>
          <p className="truncate text-sm text-slate-500">{[d.specialty, d.room].filter(Boolean).join(" · ") || d.slug}</p>
        </div>
        <StatusBadge lang={lang} status={d.status} resumesAt={d.resumesAt} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-brand-50 p-2">
          <p className="text-xs text-brand-800">{t(lang, "cl_now")}</p>
          <p className="num text-2xl font-bold text-brand-700" dir="ltr">{d.currentNumber ?? "—"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-xs text-slate-500">{t(lang, "cl_waiting")}</p>
          <p className="num text-2xl font-bold" dir="ltr">{d.waiting}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="text-xs text-slate-500">{t(lang, "cl_served")}</p>
          <p className="num text-2xl font-bold" dir="ltr">{d.served}</p>
        </div>
      </div>
      {/* المدير يدفع اشتراك العيادة من صفحة اشتراكها (صفحة الطبيب لا أزرار دفع فيها لأعضاء العيادة) */}
      <Link
        href={`/c/${clinicSlug}/manage/billing`}
        className={`mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
          !sub.active ? "bg-rose-50 text-rose-800" : sub.daysLeft <= 7 ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <CreditCard size={15} />
          {!sub.active ? t(lang, "cl_subExpired") : t(lang, sub.trial ? "cl_subTrial" : "cl_subPaid", { n: sub.daysLeft })}
        </span>
        <ExternalLink size={14} />
      </Link>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <a href={`/staff/${d.slug}`} className="btn-primary btn-sm flex-1" data-testid="open-queue">
          <DoorOpen size={16} /> {t(lang, "cl_openQueue")}
        </a>
        <button type="button" className="btn-ghost btn-sm" onClick={onRoom} aria-label={t(lang, "cl_editRoom")}>
          <Pencil size={15} /> <span className="sm:hidden xl:inline">{t(lang, "cl_room")}</span>
        </button>
        <button type="button" className="btn-ghost btn-sm text-rose-700" onClick={onRemove} aria-label={t(lang, "cl_remove")}>
          <UserMinus size={15} />
        </button>
      </div>
    </article>
  );
}

function useAction(slug: string, lang: Lang) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(body: Record<string, unknown>, after: () => void | Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/c/${slug}/manage`, body);
      await after();
    } catch (e) {
      const code = (e as ApiError).code;
      setError(code === "wrong_pin" ? t(lang, "wrongPin") : code === "locked" ? t(lang, "locked") : errorText(lang, code));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

const Err = ({ text }: { text: string }) =>
  text ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{text}</p> : null;

function AddDialog({ lang, slug, open, onClose, onDone }: { lang: Lang; slug: string; open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ doctorName: "", specialty: "", kind: "doctor", room: "", slug: "", pin: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const a = useAction(slug, lang);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onClose={onClose} title={t(lang, "cl_addDoctor")} closeLabel={t(lang, "cl_close")}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          a.run({ action: "add", ...f }, async () => {
            setF({ doctorName: "", specialty: "", kind: "doctor", room: "", slug: "", pin: "" });
            setSlugTouched(false);
            await onDone();
            onClose();
          });
        }}
      >
        <div>
          <label className="label" htmlFor="ad-name">{t(lang, "st_doctorName")}</label>
          <input
            id="ad-name"
            className="input"
            required
            minLength={2}
            maxLength={80}
            value={f.doctorName}
            onChange={(e) => {
              set("doctorName", e.target.value);
              if (!slugTouched) set("slug", suggestSlug(`dr-${e.target.value}`));
            }}
            placeholder={t(lang, "nw_doctorPh")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ad-spec">{t(lang, "cl_specialty")}</label>
            <input id="ad-spec" className="input" maxLength={80} value={f.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder={t(lang, "se_specialtyPh")} />
          </div>
          <div>
            <label className="label" htmlFor="ad-room">{t(lang, "cl_room")}</label>
            <input id="ad-room" className="input" maxLength={30} value={f.room} onChange={(e) => set("room", e.target.value)} placeholder={t(lang, "cl_roomPh")} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k} type="button" onClick={() => set("kind", k)} className={`chip ${f.kind === k ? "bg-brand-600 text-white" : ""}`} aria-pressed={f.kind === k}>
              {t(lang, `kind_${k}`)}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="ad-slug">{t(lang, "cl_doctorSlug")}</label>
          <div className="flex items-center rounded-2xl border border-slate-200 bg-white focus-within:border-brand-500" dir="ltr">
            <span className="ps-3 text-sm text-slate-400">/s/</span>
            <input
              id="ad-slug"
              className="w-full bg-transparent px-1 py-3 outline-none"
              required
              pattern="[a-z0-9][a-z0-9\-]{2,39}"
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              autoCapitalize="none"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ad-pin">{t(lang, "cl_doctorPin")}</label>
          <input id="ad-pin" className="input num tracking-[0.3em]" dir="ltr" inputMode="numeric" type="password" autoComplete="new-password" required minLength={4} maxLength={8} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} />
          <p className="mt-1.5 text-xs text-slate-500">{t(lang, "cl_doctorPinHint")}</p>
        </div>
        <Err text={a.error} />
        <button className="btn-primary w-full" disabled={a.busy}>
          <Plus size={18} /> {t(lang, "cl_addDoctor")}
        </button>
      </form>
    </Dialog>
  );
}

function JoinDialog({ lang, slug, open, onClose, onDone }: { lang: Lang; slug: string; open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ slug: "", pin: "", room: "" });
  const a = useAction(slug, lang);
  return (
    <Dialog open={open} onClose={onClose} title={t(lang, "cl_joinDoctor")} closeLabel={t(lang, "cl_close")}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          a.run({ action: "join", ...f }, async () => {
            setF({ slug: "", pin: "", room: "" });
            await onDone();
            onClose();
          });
        }}
      >
        <p className="text-sm leading-relaxed text-slate-600">{t(lang, "cl_joinHint")}</p>
        <div>
          <label className="label" htmlFor="jn-slug">{t(lang, "lg_slug")}</label>
          <input id="jn-slug" className="input text-start" dir="ltr" required value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="dr-benali" autoCapitalize="none" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="jn-pin">{t(lang, "cl_ownerPin")}</label>
            <input id="jn-pin" className="input num tracking-[0.3em]" dir="ltr" inputMode="numeric" type="password" autoComplete="off" required minLength={4} maxLength={8} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <label className="label" htmlFor="jn-room">{t(lang, "cl_room")}</label>
            <input id="jn-room" className="input" maxLength={30} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder={t(lang, "cl_roomPh")} />
          </div>
        </div>
        <Err text={a.error} />
        <button className="btn-primary w-full" disabled={a.busy}>
          <Link2 size={18} /> {t(lang, "cl_join")}
        </button>
      </form>
    </Dialog>
  );
}

function RoomDialog({ lang, slug, doctor, onClose, onDone }: { lang: Lang; slug: string; doctor: Doctor; onClose: () => void; onDone: () => Promise<void> }) {
  const [room, setRoom] = useState(doctor.room ?? "");
  const a = useAction(slug, lang);
  return (
    <Dialog open onClose={onClose} title={t(lang, "cl_editRoom")} closeLabel={t(lang, "cl_close")}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          a.run({ action: "room", shop: doctor.slug, room }, async () => {
            await onDone();
            onClose();
          });
        }}
      >
        <div>
          <label className="label" htmlFor="rm-room">{t(lang, "cl_room")}</label>
          <input id="rm-room" className="input" maxLength={30} value={room} onChange={(e) => setRoom(e.target.value)} placeholder={t(lang, "cl_roomPh")} autoFocus />
        </div>
        <Err text={a.error} />
        <button className="btn-primary w-full" disabled={a.busy}>{t(lang, "save")}</button>
      </form>
    </Dialog>
  );
}

function RemoveDialog({ lang, slug, doctor, onClose, onDone }: { lang: Lang; slug: string; doctor: Doctor; onClose: () => void; onDone: () => Promise<void> }) {
  const a = useAction(slug, lang);
  return (
    <Dialog open onClose={onClose} title={t(lang, "cl_remove")} closeLabel={t(lang, "cl_close")}>
      <div className="space-y-4 p-5">
        <p className="leading-relaxed text-slate-700">{t(lang, "cl_removeConfirm", { name: drTitle(lang, doctor.kind, doctor.doctorName) ?? doctor.name })}</p>
        <Err text={a.error} />
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>{t(lang, "cancel")}</button>
          <button
            type="button"
            className="btn-primary flex-1 bg-rose-600 hover:bg-rose-700"
            disabled={a.busy}
            onClick={() =>
              a.run({ action: "remove", shop: doctor.slug }, async () => {
                await onDone();
                onClose();
              })
            }
          >
            <UserMinus size={16} /> {t(lang, "cl_remove")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function PinDialog({ lang, slug, open, onClose }: { lang: Lang; slug: string; open: boolean; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [cur, setCur] = useState("");
  const [done, setDone] = useState(false);
  const a = useAction(slug, lang);
  return (
    <Dialog open={open} onClose={onClose} title={t(lang, "cl_changePin")} closeLabel={t(lang, "cl_close")}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          a.run({ action: "pin", pin, currentPin: cur }, () => {
            setPin("");
            setCur("");
            setDone(true);
          });
        }}
      >
        <div>
          <label className="label" htmlFor="mg-cur">{t(lang, "cl_currentPin")}</label>
          <input id="mg-cur" className="input num tracking-[0.3em]" dir="ltr" inputMode="numeric" type="password" autoComplete="current-password" required minLength={4} maxLength={8} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className="label" htmlFor="mg-pin">{t(lang, "newPin")}</label>
          <input id="mg-pin" className="input num tracking-[0.3em]" dir="ltr" inputMode="numeric" type="password" autoComplete="new-password" required minLength={4} maxLength={8} value={pin} onChange={(e) => { setDone(false); setPin(e.target.value.replace(/\D/g, "")); }} />
          <p className="mt-1.5 text-xs text-slate-500">{t(lang, "cl_changePinHint")}</p>
        </div>
        <Err text={a.error} />
        {done && <p className="rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-800" role="status">{t(lang, "cl_pinChanged")}</p>}
        <button className="btn-primary w-full" disabled={a.busy}>{t(lang, "save")}</button>
      </form>
    </Dialog>
  );
}
