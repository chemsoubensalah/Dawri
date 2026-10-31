import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { fmtDay } from "@/lib/domain/appointments";
import { dayKey } from "@/lib/domain/time";
import { DomainError } from "@/lib/domain/types";
import { dirOf, drTitle, t } from "@/lib/i18n";
import { appointmentView } from "@/lib/server/appointments";
import { isUuid } from "@/lib/server/appointments-repo";
import { baseUrl, getLang, staffAccess } from "@/lib/server/http";
import { ticketView } from "@/lib/server/service";
import PrintReady from "./PrintReady";

export const metadata = { title: "Ticket", robots: { index: false } };

/**
 * ورقة لطابعة التذاكر الحرارية (80 مم، مساحة طباعة 72 مم): تذكرة الطابور (?t=) أو ورقة الموعد (?a=).
 * أسود فقط وخطوط كبيرة (الرماديّ يخرج باهتاً على الورق الحراري). لا يُطبع سبب الزيارة: الورقة في يد المريض.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; a?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const access = await staffAccess(slug);
  if (!access) redirect(`/staff/${slug}`);
  const shop = access.shop;
  const lang = await getLang(shop.defaultLang);
  const base = await baseUrl();
  const qr = (url: string) => QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#000000", light: "#ffffff" } });
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  // لا نكشف تذكرة عيادة أخرى
  const load = async <T extends { shop: { slug: string } }>(id: string | undefined, get: (id: string) => Promise<T>): Promise<T | null> => {
    if (!isUuid(id)) return null;
    try {
      const v = await get(id);
      return v.shop.slug === shop.slug ? v : null;
    } catch (e) {
      if (e instanceof DomainError) return null;
      throw e;
    }
  };

  const sub = [drTitle(lang, shop.kind, shop.profile.doctorName), shop.profile.specialty].filter(Boolean).join(" · ");
  const rule = <hr className="my-[2.5mm] border-0 border-t-[0.4mm] border-dashed border-black" />;
  const header = (
    <header className="text-center">
      <div className="text-[5.6mm] leading-tight font-bold break-words">{shop.name}</div>
      {sub && <div className="mt-[0.5mm] text-[3.5mm] leading-snug">{sub}</div>}
    </header>
  );
  const scan = (svg: string, text: string) => (
    <div className="flex items-center gap-[3mm]">
      <div className="w-[25mm] shrink-0 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="text-[3.6mm] leading-snug font-bold">{text}</div>
    </div>
  );
  const footer = <div className="mt-[2mm] text-center text-[3mm]">دوري · Dawri</div>;

  let body: React.ReactNode;
  const tk = q.t ? await load(q.t, ticketView) : null;
  const ap = !tk && q.a ? await load(q.a, appointmentView) : null;
  if (tk) {
    const open = ["pending_approval", "waiting", "called", "deferred"].includes(tk.status);
    body = (
      <>
        {header}
        {rule}
        <div className="text-center text-[4.4mm] font-bold">{t(lang, "pr_yourNumber")}</div>
        <div className="num text-center text-[26mm] leading-none font-bold" data-testid="receipt-number">
          {tk.number}
        </div>
        <div className="mt-[1.5mm] text-center text-[5mm] leading-tight font-bold break-words">{tk.name}</div>
        {tk.priority && <div className="mt-[0.5mm] text-center text-[3.6mm] font-bold">★ {t(lang, "pr_priority")}</div>}
        <div className="mt-[2mm] space-y-[0.8mm] text-center text-[3.8mm]">
          {open && tk.ahead !== null && (
            <div className="font-bold">
              {t(lang, "pr_ahead", { n: tk.ahead })}
              {tk.etaMin ? ` · ${t(lang, "pr_wait", { n: tk.etaMin })}` : ""}
            </div>
          )}
          {open && tk.currentNumber !== null && <div>{t(lang, "pr_current", { n: tk.currentNumber })}</div>}
          <div className="num">
            {fmtDay(lang, dayKey(new Date(tk.createdAt)))} · <span dir="ltr">{time(tk.createdAt)}</span>
          </div>
        </div>
        {rule}
        {scan(await qr(`${base}/t/${tk.id}`), t(lang, "pr_scanTicket"))}
        {rule}
        <div className="text-center text-[3.8mm] font-bold">{t(lang, "pr_keepTicket")}</div>
        {footer}
      </>
    );
  } else if (ap) {
    const contact = [ap.shop.profile.address, ap.shop.profile.phone].filter(Boolean);
    body = (
      <>
        {header}
        {rule}
        <div className="text-center text-[4.4mm] font-bold">{t(lang, "pr_yourAppt")}</div>
        <div className="mt-[1mm] text-center text-[6mm] leading-tight font-bold">{fmtDay(lang, ap.day)}</div>
        <div className="num text-center text-[17mm] leading-none font-bold" dir="ltr" data-testid="receipt-time">
          {ap.time}
        </div>
        <div className="mt-[1.5mm] text-center text-[5mm] leading-tight font-bold break-words">{ap.name}</div>
        {contact.length > 0 && (
          <div className="mt-[2mm] space-y-[0.5mm] text-center text-[3.6mm] leading-snug">
            {ap.shop.profile.address && <div className="break-words">{ap.shop.profile.address}</div>}
            {ap.shop.profile.phone && (
              <div className="num font-bold" dir="ltr">
                ☎ {ap.shop.profile.phone}
              </div>
            )}
          </div>
        )}
        {rule}
        {scan(await qr(`${base}/a/${ap.id}`), t(lang, "pr_scanAppt"))}
        {rule}
        <div className="text-center text-[3.8mm] font-bold">{t(lang, "pr_comeEarly")}</div>
        {footer}
      </>
    );
  } else {
    if (q.t || q.a) return <main className="p-10 text-center text-slate-500">{t(lang, "pr_notFound")}</main>;
    notFound();
  }

  return (
    <main className="min-h-dvh bg-slate-100 py-6 print:min-h-0 print:bg-white print:py-0">
      <div id="receipt" dir={dirOf(lang)} className="mx-auto w-[72mm] bg-white px-[1mm] py-[3mm] text-black shadow-sm print:shadow-none" data-testid="receipt">
        {body}
      </div>
      <PrintReady label={t(lang, "pr_print")} />
    </main>
  );
}
