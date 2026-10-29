"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarPlus, ChevronLeft, ChevronRight, Clock3, DoorOpen, Ticket } from "lucide-react";
import { daysBetween, fmtDay } from "@/lib/domain/appointments";
import type { Lang } from "@/lib/domain/types";
import { errorText, t } from "@/lib/i18n";
import { api, ApiError, loadFlow, saveTicket, savedTicket, unlockAudio } from "@/lib/client";
import { forgetAppt, savedAppts, todayAlgiers } from "@/lib/appointments-client";
import type { AppointmentView, BookingTeaser } from "@/lib/server/appointments";

function whenLabel(lang: Lang, today: string, day: string, time: string) {
  const d = daysBetween(today, day);
  const dl = d === 0 ? t(lang, "ap_today") : d === 1 ? t(lang, "ap_tomorrow") : fmtDay(lang, day, "short");
  return `${dl} ${time}`;
}

/**
 * صفحة العيادة: «استشارة اليوم» أو «احجز موعداً» كاختيار واضح،
 * و«موعدك القادم»، ومن مسح رمز الباب وله موعد اليوم: تسجيل وصوله مباشرة.
 */
export default function ShopBooking({
  lang,
  slug,
  door,
  teaser,
  blocker,
  onHideForm,
}: {
  lang: Lang;
  slug: string;
  door: string | null;
  teaser: BookingTeaser | null;
  blocker: string | null;
  onHideForm: (hide: boolean) => void;
}) {
  const router = useRouter();
  const [mine, setMine] = useState<AppointmentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const list = savedAppts(slug);
    const target = door ? list.find((a) => a.day === todayAlgiers()) : list[0];
    if (!target) return;
    api<AppointmentView>(`/api/a/${target.id}`)
      .then((v) => {
        if (v.status !== "booked") return forgetAppt(slug, v.id);
        setMine(v);
        // عاد إلى رابط العيادة وله موعد قادم: نفتح موعده (كما تُفتح تذكرة اليوم) —
        // إلّا إن جاء من صفحة موعده/تذكرته، أو له رقم اليوم، أو كان في منتصف أخذ رقم
        const fromTicket = new URLSearchParams(location.search).get("from") === "ticket";
        const midFlow = loadFlow<{ step?: string }>(`ticket:${slug}`)?.step;
        if (!door && !fromTicket && !savedTicket(slug) && (!midFlow || midFlow === "form")) router.replace(`/a/${v.id}`);
      })
      .catch((e) => {
        if ((e as ApiError).status === 404) forgetAppt(slug, target.id);
      });
  }, [slug, door, router]);

  // عند الباب وله موعد اليوم: بطاقة الوصول تحلّ محلّ نموذج أخذ رقم
  const atDoor = Boolean(door && mine && mine.day === mine.today && mine.window !== "late");
  useEffect(() => onHideForm(atDoor), [atDoor, onHideForm]);

  const checkIn = async () => {
    if (!mine) return;
    unlockAudio();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ ticketId: string | null }>(`/api/a/${mine.id}`, { action: "checkin", door });
      if (r.ticketId) {
        saveTicket(slug, r.ticketId);
        try {
          sessionStorage.setItem("dawri:justTook", r.ticketId);
        } catch {}
        router.push(`/t/${r.ticketId}`);
      }
    } catch (e) {
      setError(errorText(lang, (e as ApiError).code));
    } finally {
      setBusy(false);
    }
  };

  if (atDoor && mine) {
    return (
      <section className="card space-y-4 text-center ring-2 ring-brand-500" data-testid="appt-door">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <CalendarCheck2 size={30} />
        </span>
        <p className="text-lg leading-snug font-bold">{t(lang, "ap_doorTitle", { time: mine.time })}</p>
        {mine.window === "open" ? (
          <>
            <p className="text-sm leading-relaxed text-slate-600">{t(lang, "ap_doorHint")}</p>
            <button className="btn-primary w-full py-5 text-xl" onClick={checkIn} disabled={busy} data-testid="appt-door-checkin">
              <DoorOpen size={24} /> {busy ? "…" : t(lang, "ap_iArrived")}
            </button>
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-start text-sm text-slate-700">
            <Clock3 size={18} className="mt-0.5 shrink-0 text-brand-600" /> {t(lang, "ap_checkinOpens", { time: mine.opensAt })}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
            {error}
          </p>
        )}
        <Link href={`/a/${mine.id}?c=${encodeURIComponent(door ?? "")}`} className="block text-sm font-semibold text-brand-700 hover:underline">
          {t(lang, "ap_openAppt")}
        </Link>
      </section>
    );
  }

  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;
  return (
    <>
      {mine && (
        <Link
          href={`/a/${mine.id}`}
          className="flex items-center gap-3 rounded-3xl bg-brand-50/80 p-4 ring-1 ring-brand-200 transition hover:bg-brand-50"
          data-testid="appt-upcoming"
        >
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <CalendarCheck2 size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-brand-700">{t(lang, "ap_upcomingMine")}</span>
            <span className="block truncate font-bold text-ink">
              {fmtDay(lang, mine.day)} · <span dir="ltr" className="num">{mine.time}</span>
            </span>
          </span>
          <Chevron size={20} className="shrink-0 text-brand-600" />
        </Link>
      )}

      {teaser && (
        <nav className="grid grid-cols-2 gap-2.5" aria-label={t(lang, "ap_choiceBook")} data-testid="booking-choice">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("name");
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.focus({ preventScroll: true });
              }
            }}
            aria-current={!blocker ? "true" : undefined}
            className={`flex flex-col items-start rounded-3xl p-4 text-start transition ${
              !blocker ? "bg-white shadow-(--shadow-brand) ring-2 ring-brand-500" : "bg-white/80 ring-1 ring-slate-200"
            }`}
          >
            <span className={`inline-flex size-10 items-center justify-center rounded-xl ${!blocker ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              <Ticket size={20} />
            </span>
            <span className="mt-2.5 leading-snug font-bold text-ink">{t(lang, "ap_choiceToday")}</span>
            <span className={`mt-0.5 text-xs leading-snug ${blocker ? "font-semibold text-amber-700" : "text-slate-500"}`}>
              {blocker ? errorText(lang, blocker) : t(lang, "ap_choiceTodaySub")}
            </span>
          </button>
          <Link
            href={`/s/${slug}/book`}
            className={`flex flex-col items-start rounded-3xl p-4 transition ${
              blocker ? "bg-white shadow-(--shadow-brand) ring-2 ring-brand-500" : "bg-white ring-1 ring-slate-200 hover:ring-brand-300"
            }`}
            data-testid="booking-link"
          >
            <span className="flex w-full items-center justify-between">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/70">
                <CalendarPlus size={20} />
              </span>
              <Chevron size={18} className="text-slate-400" />
            </span>
            <span className="mt-2.5 leading-snug font-bold text-ink">{t(lang, "ap_choiceBook")}</span>
            <span className="mt-0.5 text-xs leading-snug text-slate-500">
              {teaser.next ? (
                <>
                  {t(lang, "ap_choiceBookNext", { when: "" })}
                  <b className="font-semibold text-brand-700">{whenLabel(lang, teaser.today, teaser.next.day, teaser.next.time)}</b>
                </>
              ) : (
                t(lang, "ap_choiceBookFull")
              )}
            </span>
          </Link>
        </nav>
      )}
    </>
  );
}
