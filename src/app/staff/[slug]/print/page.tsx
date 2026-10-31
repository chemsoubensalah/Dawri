import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { addDays, fmtDay } from "@/lib/domain/appointments";
import { BLOCK_SCALE, PRINTABLE_MM, readPrintConfig, TEXT_SCALE, type Layout, type PrintBlock } from "@/lib/domain/printing";
import { dayKey } from "@/lib/domain/time";
import { DomainError, type Lang } from "@/lib/domain/types";
import { dirOf, drTitle, t, type DictKey } from "@/lib/i18n";
import { appointmentView } from "@/lib/server/appointments";
import { isUuid } from "@/lib/server/appointments-repo";
import { baseUrl, getLang, staffAccess } from "@/lib/server/http";
import { printConfigOf } from "@/lib/server/print-settings";
import { ticketView } from "@/lib/server/service";
import PrintReady from "./PrintReady";

export const metadata = { title: "Ticket", robots: { index: false } };

/** حجم كلّ عنصر (مم) بالتصميم الأصلي: عرض 72 مم، كتابة «عادية»، حجم العنصر «m» */
const BASE_MM: Record<Layout, Record<string, number>> = {
  ticket: { clinic: 5.6, doctor: 3.5, specialty: 3.5, label: 4.4, number: 26, name: 5, priority: 3.6, ahead: 3.8, current: 3.8, date: 3.8, qr: 3.6, note: 3.8, footer: 3, text: 3.8 },
  appt: { clinic: 5.6, doctor: 3.5, specialty: 3.5, label: 4.4, date: 6, time: 17, name: 5, address: 3.6, phone: 3.6, qr: 3.6, note: 3.8, footer: 3, text: 3.8 },
};
const ALIGN = { right: "text-right", center: "text-center", left: "text-left" } as const;

/**
 * أرقام الهاتف داخل نصّ عربي تنقلب مجموعاتها («023 45 67 89» ← «89 67 45 023»):
 * كلّ تسلسل أرقام (مع مسافات/نقاط/شرطات) يُعزل من اليسار إلى اليمين.
 */
function ltrNumbers(text: string): React.ReactNode {
  const parts = text.split(/(\+?\d[\d\s.\-/]*\d)/g);
  return parts.length === 1
    ? text
    : parts.map((p, i) =>
        i % 2 ? (
          <bdi key={i} dir="ltr">
            {p}
          </bdi>
        ) : (
          p
        ),
      );
}

interface TicketData {
  number: number;
  name: string;
  priority: boolean;
  status: string;
  ahead: number | null;
  etaMin: number | null;
  currentNumber: number | null;
  createdAt: string;
  url: string;
}
interface ApptData {
  day: string;
  time: string;
  name: string;
  address: string | null;
  phone: string | null;
  url: string;
}

/**
 * ورقة لطابعة التذاكر الحرارية: تذكرة الطابور (?t=) أو ورقة الموعد (?a=)،
 * أو ورقة تجريبية (?sample=ticket|appt، مع cfg = إعداد لم يُحفظ بعد؛ preview=1 = معاينة الإعدادات بلا زرّ).
 * التصميم من إعداد الطبيب («طباعة التذاكر»): العناصر بترتيبه، بحجمها وسُمكها ومحاذاتها، ونصوصه.
 * أسود فقط (الرماديّ يخرج باهتاً على الورق الحراري). لا يُطبع سبب الزيارة: الورقة في يد المريض.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; a?: string; sample?: string; preview?: string; cfg?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const access = await staffAccess(slug);
  if (!access) redirect(`/staff/${slug}`);
  const shop = access.shop;
  const uiLang = await getLang(shop.defaultLang);
  const base = await baseUrl();
  const sample = q.sample === "ticket" || q.sample === "1" ? "ticket" : q.sample === "appt" ? "appt" : null;
  // التجربة تقبل إعداداً لم يُحفظ بعد (من صفحة الإعدادات) — يُقرأ ويُنظَّف كأيّ إعداد محفوظ
  let draft: unknown = null;
  if (sample && q.cfg && q.cfg.length < 12_000) {
    try {
      draft = JSON.parse(q.cfg);
    } catch {}
  }
  const cfg = draft ? readPrintConfig(draft) : printConfigOf(shop);
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
  // صغير بما يكفي لتوفير الورق، وكافٍ لكاميرا الهاتف (18 مم على ورق 80، 16 مم على 58)
  const qrMm = Math.max(16, (18 * width) / 72);
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

  /** نصّ الطبيب إن كتبه، وإلّا العنوان الافتراضي بلغة الورقة */
  const label = (b: PrintBlock, key: DictKey) => (b.text ? ltrNumbers(b.text) : bi((l) => t(l, key)));

  /** محتوى عنصر واحد (null = لا شيء يُطبع: بيانات غائبة) */
  async function content(kind: Layout, b: PrintBlock, d: { tk?: TicketData; ap?: ApptData }): Promise<React.ReactNode> {
    const name = b.key.replace(/-\d+$/, "");
    const tk = d.tk;
    const ap = d.ap;
    const open = tk ? ["pending_approval", "waiting", "called", "deferred"].includes(tk.status) : false;
    switch (name) {
      case "clinic":
        return shop.name;
      case "doctor":
        return drTitle(lang, shop.kind, shop.profile.doctorName) ? bi((l) => drTitle(l, shop.kind, shop.profile.doctorName)) : null;
      case "specialty":
        return shop.profile.specialty || null;
      case "label":
        return label(b, kind === "ticket" ? "pr_yourNumber" : "pr_yourAppt");
      case "number":
        return tk ? <span className="num leading-none">{tk.number}</span> : null;
      case "name":
        return (tk ?? ap)?.name ?? null;
      case "priority":
        return tk?.priority ? <>★ {bi((l) => t(l, "pr_priority"))}</> : null;
      case "ahead":
        return tk && open && tk.ahead !== null
          ? bi((l) => `${t(l, "pr_ahead", { n: tk.ahead! })}${tk.etaMin ? ` · ${t(l, "pr_wait", { n: tk.etaMin })}` : ""}`)
          : null;
      case "current":
        return tk && open && tk.currentNumber !== null ? bi((l) => t(l, "pr_current", { n: tk.currentNumber! })) : null;
      case "date":
        if (tk) return <span className="num">{bi((l) => `${fmtDay(l, dayKey(new Date(tk.createdAt)))} · ${time(tk.createdAt)}`)}</span>;
        return ap ? bi((l) => fmtDay(l, ap.day)) : null;
      case "time":
        return ap ? (
          <span className="num leading-none" dir="ltr">
            {ap.time}
          </span>
        ) : null;
      case "address":
        return ap?.address ? ltrNumbers(ap.address) : null;
      case "phone":
        return ap?.phone ? (
          <span className="num" dir="ltr">
            ☎ {ap.phone}
          </span>
        ) : null;
      case "qr": {
        const url = (tk ?? ap)?.url;
        if (!url) return null;
        const side = Math.max(14, qrMm * BLOCK_SCALE[b.size]);
        return (
          <span
            className="flex items-center gap-[3mm]"
            // يمين/يسار حقيقيّان مهما كان اتّجاه الورقة
            style={{ justifyContent: b.align === "center" ? "center" : (b.align === "right") === (dirOf(lang) === "rtl") ? "flex-start" : "flex-end" }}
          >
            <span className="block shrink-0 [&>svg]:h-auto [&>svg]:w-full" style={{ width: `${side}mm` }} dangerouslySetInnerHTML={{ __html: await qr(url) }} />
            <span className="text-start leading-snug">{label(b, kind === "ticket" ? "pr_scanTicket" : "pr_scanAppt")}</span>
          </span>
        );
      }
      case "note":
        return label(b, kind === "ticket" ? "pr_keepTicket" : "pr_comeEarly");
      case "footer":
        return "دوري · Dawri";
      case "text":
        return b.text ? ltrNumbers(b.text) : null;
      default:
        return null;
    }
  }

  /** الورقة بتصميم الطبيب: الخطوط الفاصلة المتتالية أو على الأطراف تُدمج/تُحذف */
  async function render(kind: Layout, d: { tk?: TicketData; ap?: ApptData }) {
    const parts: { b: PrintBlock; node: React.ReactNode }[] = [];
    for (const b of cfg[kind]) {
      if (!b.show) continue;
      if (b.key.startsWith("line-")) {
        parts.push({ b, node: null });
        continue;
      }
      const node = await content(kind, b, d);
      if (node !== null && node !== "") parts.push({ b, node });
    }
    const kept = parts.filter((p, i) => {
      if (!p.b.key.startsWith("line-")) return true;
      return i > 0 && i < parts.length - 1 && !parts[i - 1].b.key.startsWith("line-");
    });
    while (kept.length && kept[kept.length - 1].b.key.startsWith("line-")) kept.pop();
    return kept.map(({ b, node }, i) =>
      b.key.startsWith("line-") ? (
        <hr key={b.key} className="my-[2.5mm] border-0 border-t-[0.4mm] border-dashed border-black" />
      ) : (
        <div
          key={b.key}
          className={`${ALIGN[b.align]} ${b.bold ? "font-bold" : "font-normal"} leading-tight break-words ${i > 0 && !kept[i - 1].b.key.startsWith("line-") ? "mt-[1.2mm]" : ""}`}
          style={{ fontSize: `${((BASE_MM[kind][b.key.replace(/-\d+$/, "")] ?? 3.8) * k * BLOCK_SCALE[b.size]).toFixed(2)}mm` }}
          data-block={b.key}
        >
          {node}
        </div>
      ),
    );
  }

  let body: React.ReactNode;
  if (sample === "ticket") {
    body = await render("ticket", {
      tk: {
        number: 12,
        name: t(lang, "pr_sampleName"),
        priority: false,
        status: "waiting",
        ahead: 3,
        etaMin: 20,
        currentNumber: 9,
        createdAt: new Date().toISOString(),
        url: `${base}/s/${shop.slug}`,
      },
    });
  } else if (sample === "appt") {
    body = await render("appt", {
      ap: {
        day: addDays(dayKey(new Date()), 1),
        time: "10:30",
        name: t(lang, "pr_sampleName"),
        address: shop.profile.address,
        phone: shop.profile.phone,
        url: `${base}/s/${shop.slug}`,
      },
    });
  } else {
    const tk = q.t ? await load(q.t, ticketView) : null;
    const ap = !tk && q.a ? await load(q.a, appointmentView) : null;
    if (tk) body = await render("ticket", { tk: { ...tk, url: `${base}/t/${tk.id}` } });
    else if (ap) body = await render("appt", { ap: { ...ap, address: ap.shop.profile.address, phone: ap.shop.profile.phone, url: `${base}/a/${ap.id}` } });
    else {
      if (q.t || q.a) return <main className="p-10 text-center text-slate-500">{t(uiLang, "pr_notFound")}</main>;
      notFound();
    }
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
