import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { BellRing, Hourglass, QrCode, Smartphone, UserCheck } from "lucide-react";
import StaffFrame from "@/components/StaffFrame";
import { LogoMark } from "@/components/ui";
import { t, type DictKey, drTitle } from "@/lib/i18n";
import { baseUrl, getLang, staffShop } from "@/lib/server/http";
import PrintButton from "./PrintButton";

export const metadata = { title: "ملصق QR", robots: { index: false } };

/** ملصق الباب A4 — بالعربية والفرنسية معاً. رمز الباب يسمح بتسجيل «وصلت». */
export default async function QrPoster({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  const base = await baseUrl();
  const doorUrl = `${base}/s/${shop.slug}?c=${encodeURIComponent(shop.doorCode)}`;
  const shareUrl = `${base}/s/${shop.slug}`;
  const svg = await QRCode.toString(doorUrl, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#0b1b2b", light: "#ffffff" } });
  const sub = [drTitle(lang, shop.kind, shop.profile.doctorName), shop.profile.specialty].filter(Boolean).join(" · ");
  const steps: [React.ReactNode, DictKey, DictKey][] = [
    [<QrCode key="1" size={28} />, "pq_s1", "pq_s1"],
    [<Hourglass key="2" size={28} />, "pq_s2", "pq_s2"],
    [<BellRing key="3" size={28} />, "pq_s3", "pq_s3"],
  ];

  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} theme={shop.look.theme} active="qr">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t(lang, "nav_poster")}</h1>
          <p className="text-sm text-slate-600">{t(lang, "pq_intro")}</p>
        </div>
        <PrintButton label={t(lang, "print")} />
      </div>

      {/* ورقة A4 */}
      <article className="mx-auto aspect-[210/297] w-full max-w-[720px] overflow-hidden rounded-3xl bg-white shadow-(--shadow-lift) ring-1 ring-slate-200 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <div className="flex h-full flex-col">
          <header className="bg-gradient-to-br from-brand-600 to-brand-800 px-[6%] py-[5%] text-center text-white">
            <div className="flex items-center justify-center gap-3">
              <LogoMark size={44} />
              <span className="text-3xl font-bold">دوري · Dawri</span>
            </div>
            <h2 className="mt-4 text-[clamp(1.4rem,4.2vw,2.4rem)] leading-tight font-bold">{shop.name}</h2>
            {sub && <p className="mt-1 text-lg text-brand-100">{sub}</p>}
          </header>

          <div className="flex flex-1 flex-col items-center justify-center gap-[4%] px-[7%] py-[4%]">
            <div className="text-center">
              <p className="text-[clamp(1.3rem,3.8vw,2.2rem)] leading-tight font-bold text-ink" dir="rtl">{t("ar", "posterTitle")}</p>
              <p className="mt-1 text-[clamp(1rem,2.6vw,1.5rem)] font-semibold text-slate-500" dir="ltr">{t("fr", "posterTitle")}</p>
            </div>
            <div className="w-[52%] rounded-[1.5rem] bg-white p-4 shadow-[0_0_0_6px_var(--color-brand-50),0_0_0_8px_var(--color-brand-200)]" dangerouslySetInnerHTML={{ __html: svg }} />
            <ol className="grid w-full grid-cols-3 gap-3 text-center">
              {steps.map(([icon, k], i) => (
                <li key={i} className="rounded-2xl bg-slate-50 p-3">
                  <span className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">{icon}</span>
                  <p className="mt-2 text-sm leading-snug font-bold text-ink" dir="rtl">{t("ar", k)}</p>
                  <p className="mt-1 text-xs leading-snug text-slate-500" dir="ltr">{t("fr", k)}</p>
                </li>
              ))}
            </ol>
          </div>

          <footer className="mx-[6%] mb-[5%] flex items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-white">
            <UserCheck size={30} className="shrink-0 text-brand-300" />
            <div className="min-w-0 flex-1">
              <p className="font-bold" dir="rtl">{t("ar", "posterArrived")}</p>
              <p className="text-sm text-slate-300" dir="ltr">{t("fr", "posterArrived")}</p>
            </div>
            <Smartphone size={26} className="shrink-0 text-slate-400" />
          </footer>
          <p className="mb-[3%] text-center text-xs text-slate-500" dir="rtl">
            {t("ar", "noSmartphone")} · <span dir="ltr">{t("fr", "noSmartphone")}</span>
          </p>
        </div>
      </article>

      <div className="no-print mx-auto mt-6 max-w-[720px] space-y-2">
        <p className="text-sm font-semibold text-slate-600">{t(lang, "shareLink")}</p>
        <p className="num rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200" dir="ltr">{shareUrl}</p>
        <p className="text-xs text-slate-500">{t(lang, "pq_doorNote")}</p>
      </div>
    </StaffFrame>
  );
}
