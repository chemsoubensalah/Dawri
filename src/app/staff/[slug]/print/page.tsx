import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { fmtDay } from "@/lib/domain/appointments";
import { PRINTABLE_MM, readPrintConfig, TEXT_SCALE } from "@/lib/domain/printing";
import { dayKey } from "@/lib/domain/time";
import { DomainError, type Lang } from "@/lib/domain/types";
import { dirOf, drTitle, t } from "@/lib/i18n";
import { appointmentView } from "@/lib/server/appointments";
import { isUuid } from "@/lib/server/appointments-repo";
import { baseUrl, getLang, staffAccess } from "@/lib/server/http";
import { printConfigOf } from "@/lib/server/print-settings";
import { ticketView } from "@/lib/server/service";
import PrintReady from "./PrintReady";

export const metadata = { title: "Ticket", robots: { index: false } };

/**
 * ورقة لطابعة التذاكر الحرارية: تذكرة الطابور (?t=) أو ورقة الموعد (?a=)،
 * أو تذكرة تجريبية (?sample=1، مع p/s/qr لتجربة إعداد قبل حفظه؛ preview=1 = معاينة الإعدادات بلا زرّ).
 * العرض وحجم الكتابة من إعداد الطبيب («طباعة التذاكر»): كلّ المقاسات تُضرب في معامل واحد.
 * أسود فقط وخطوط كبيرة (الرماديّ يخرج باهتاً على الورق الحراري). لا يُطبع سبب الزيارة: الورقة في يد المريض.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; a?: string; sample?: string; preview?: string; p?: string; s?: string; qr?: string; l?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const access = await staffAccess(slug);
  if (!access) redirect(`/staff/${slug}`);
  const shop = access.shop;
  const uiLang = await getLang(shop.defaultLang);
  const base = await baseUrl();
  const sample = q.sample === "1";
  // التجربة تقبل إعداداً لم يُحفظ بعد (من صفحة الإعدادات)
  const cfg = sample ? readPrintConfig({ ...printConfigOf(shop), ...(q.p ? { paper: Number(q.p) } : {}), ...(q.s ? { size: q.s } : {}), ...(q.qr ? { qr: q.qr === "1" } : {}), ...(q.l ? { lang: q.l } : {}) }) : printConfigOf(shop);
  // لغة الورقة (إعداد الطبيب): «الاثنتان» = العربية ثمّ الفرنسية تحتها
  const langs: Lang[] = cfg.lang === "both" ? ["ar", "fr"] : [cfg.lang === "auto" ? uiLang : cfg.lang];
  const lang = langs[0];
  const bi = (text: (l: Lang) => string | null) =>
    langs.length === 1 ? (
      text(lang)
    ) : (
      <>
        {text("ar")}
        <span className="block font-semibold" dir="ltr" style={{ fontSize: "0.8em" }}>
          {text("fr")}
        </span>
      </>
    );
  const width = PRINTABLE_MM[cfg.paper];
  /** مقاس مصمَّم لعرض 72 مم وكتابة «عادية» ← المقاس الفعلي */
  const k = (width / 72) * TEXT_SCALE[cfg.size];
  const fs = (n: number) => ({ fontSize: `${(n * k).toFixed(2)}mm` });
  const qrMm = Math.max(20, (25 * width) / 72);
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

  const doctor = drTitle(lang, shop.kind, shop.profile.doctorName);
  const rule = <hr className="my-[2.5mm] border-0 border-t-[0.4mm] border-dashed border-black" />;
  const header = (
    <header className="text-center">
      <div className="leading-tight font-bold break-words" style={fs(5.6)}>
        {shop.name}
      </div>
      {doctor && (
        <div className="mt-[0.5mm] leading-snug" style={fs(3.5)}>
          {bi((l) => drTitle(l, shop.kind, shop.profile.doctorName))}
        </div>
      )}
      {shop.profile.specialty && (
        <div className="leading-snug" style={fs(3.5)}>
          {shop.profile.specialty}
        </div>
      )}
    </header>
  );
  // بلا QR (إعداد الطبيب): لا قسم ولا خطّ فاصل
  const scan = async (url: string, text: React.ReactNode) =>
    cfg.qr ? (
      <>
        <div className="flex items-center gap-[3mm]">
          <div className="shrink-0 [&>svg]:h-auto [&>svg]:w-full" style={{ width: `${qrMm}mm` }} dangerouslySetInnerHTML={{ __html: await qr(url) }} />
          <div className="leading-snug font-bold" style={fs(3.6)}>
            {text}
          </div>
        </div>
        {rule}
      </>
    ) : null;
  const footer = (
    <div className="mt-[2mm] text-center" style={fs(3)}>
      دوري · Dawri
    </div>
  );
  const ticketBody = (tk: {
    id: string;
    number: number;
    name: string;
    priority: boolean;
    status: string;
    ahead: number | null;
    etaMin: number | null;
    currentNumber: number | null;
    createdAt: string;
    url: string;
  }) => {
    const open = ["pending_approval", "waiting", "called", "deferred"].includes(tk.status);
    return (async () => (
      <>
        {header}
        {rule}
        <div className="text-center font-bold" style={fs(4.4)}>
          {bi((l) => t(l, "pr_yourNumber"))}
        </div>
        <div className="num text-center leading-none font-bold" style={fs(26)} data-testid="receipt-number">
          {tk.number}
        </div>
        <div className="mt-[1.5mm] text-center leading-tight font-bold break-words" style={fs(5)}>
          {tk.name}
        </div>
        {tk.priority && (
          <div className="mt-[0.5mm] text-center font-bold" style={fs(3.6)}>
            ★ {bi((l) => t(l, "pr_priority"))}
          </div>
        )}
        <div className="mt-[2mm] space-y-[0.8mm] text-center" style={fs(3.8)}>
          {open && tk.ahead !== null && (
            <div className="font-bold">{bi((l) => `${t(l, "pr_ahead", { n: tk.ahead! })}${tk.etaMin ? ` · ${t(l, "pr_wait", { n: tk.etaMin })}` : ""}`)}</div>
          )}
          {open && tk.currentNumber !== null && <div>{bi((l) => t(l, "pr_current", { n: tk.currentNumber! }))}</div>}
          <div className="num">{bi((l) => `${fmtDay(l, dayKey(new Date(tk.createdAt)))} · ${time(tk.createdAt)}`)}</div>
        </div>
        {rule}
        {await scan(tk.url, bi((l) => t(l, "pr_scanTicket")))}
        <div className="text-center font-bold" style={fs(3.8)}>
          {bi((l) => t(l, "pr_keepTicket"))}
        </div>
        {footer}
      </>
    ))();
  };

  let body: React.ReactNode;
  const tk = q.t ? await load(q.t, ticketView) : null;
  const ap = !tk && q.a ? await load(q.a, appointmentView) : null;
  if (sample) {
    body = await ticketBody({
      id: "sample",
      number: 12,
      name: t(lang, "pr_sampleName"),
      priority: false,
      status: "waiting",
      ahead: 3,
      etaMin: 20,
      currentNumber: 9,
      createdAt: new Date().toISOString(),
      url: `${base}/s/${shop.slug}`,
    });
  } else if (tk) {
    body = await ticketBody({ ...tk, url: `${base}/t/${tk.id}` });
  } else if (ap) {
    const contact = [ap.shop.profile.address, ap.shop.profile.phone].filter(Boolean);
    body = (
      <>
        {header}
        {rule}
        <div className="text-center font-bold" style={fs(4.4)}>
          {bi((l) => t(l, "pr_yourAppt"))}
        </div>
        <div className="mt-[1mm] text-center leading-tight font-bold" style={fs(6)}>
          {bi((l) => fmtDay(l, ap.day))}
        </div>
        <div className="num text-center leading-none font-bold" dir="ltr" style={fs(17)} data-testid="receipt-time">
          {ap.time}
        </div>
        <div className="mt-[1.5mm] text-center leading-tight font-bold break-words" style={fs(5)}>
          {ap.name}
        </div>
        {contact.length > 0 && (
          <div className="mt-[2mm] space-y-[0.5mm] text-center leading-snug" style={fs(3.6)}>
            {ap.shop.profile.address && <div className="break-words">{ap.shop.profile.address}</div>}
            {ap.shop.profile.phone && (
              <div className="num font-bold" dir="ltr">
                ☎ {ap.shop.profile.phone}
              </div>
            )}
          </div>
        )}
        {rule}
        {await scan(`${base}/a/${ap.id}`, bi((l) => t(l, "pr_scanAppt")))}
        <div className="text-center font-bold" style={fs(3.8)}>
          {bi((l) => t(l, "pr_comeEarly"))}
        </div>
        {footer}
      </>
    );
  } else {
    if (q.t || q.a) return <main className="p-10 text-center text-slate-500">{t(uiLang, "pr_notFound")}</main>;
    notFound();
  }

  return (
    <main className="min-h-dvh bg-slate-100 py-6 print:min-h-0 print:bg-white print:py-0">
      <div
        id="receipt"
        dir={dirOf(lang)}
        className="mx-auto bg-white px-[1mm] py-[3mm] text-black shadow-sm print:shadow-none"
        style={{ width: `${width}mm` }}
        data-testid="receipt"
      >
        {body}
      </div>
      <PrintReady label={t(uiLang, "pr_print")} paper={cfg.paper} button={q.preview !== "1"} />
    </main>
  );
}
