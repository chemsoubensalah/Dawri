import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ArrowRight, BellRing, Hourglass, Stethoscope } from "lucide-react";
import { LogoMark } from "@/components/ui";
import { themeVars } from "@/lib/theme";
import { dirOf, t, type DictKey } from "@/lib/i18n";
import { baseUrl, getLang } from "@/lib/server/http";
import { managerClinic } from "@/lib/server/clinicHttp";
import PrintButton from "@/app/staff/[slug]/qr/PrintButton";

export const metadata = { title: "ملصق العيادة", robots: { index: false } };

/** ملصق A4 للعيادة كلّها (عربي + فرنسي): QR ← صفحة العيادة، والمريض يختار طبيبه. */
export default async function ClinicPoster({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clinic = await managerClinic(slug);
  if (!clinic) redirect(`/c/${slug}/manage`);
  const lang = await getLang();
  const url = `${await baseUrl()}/c/${clinic.slug}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#0b1b2b", light: "#ffffff" } });
  const steps: [React.ReactNode, DictKey][] = [
    [<Stethoscope key="1" size={28} />, "cl_pq1"],
    [<Hourglass key="2" size={28} />, "cl_pq2"],
    [<BellRing key="3" size={28} />, "cl_pq3"],
  ];
  return (
    <div className="min-h-dvh bg-[#f3f5f8] px-3 py-5 sm:px-5" dir={dirOf(lang)} lang={lang} style={themeVars(clinic.look)}>
      <div className="no-print mx-auto mb-5 flex max-w-[720px] flex-wrap items-center justify-between gap-3">
        <Link href={`/c/${clinic.slug}/manage`} className="btn-ghost">
          <ArrowRight size={16} className="ltr:rotate-180" /> {t(lang, "cl_back")}
        </Link>
        <PrintButton label={t(lang, "print")} />
      </div>
      <article className="mx-auto aspect-[210/297] w-full max-w-[720px] overflow-hidden rounded-3xl bg-white shadow-(--shadow-lift) ring-1 ring-slate-200 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <div className="flex h-full flex-col">
          <header className="bg-gradient-to-br from-brand-600 to-brand-800 px-[6%] py-[5%] text-center text-white">
            <div className="flex items-center justify-center gap-3">
              <LogoMark size={44} />
              <span className="text-3xl font-bold">دوري · Dawri</span>
            </div>
            <h1 className="mt-4 text-[clamp(1.4rem,4.2vw,2.4rem)] leading-tight font-bold">{clinic.name}</h1>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center gap-[4%] px-[7%] py-[4%]">
            <div className="text-center">
              <p className="text-[clamp(1.3rem,3.8vw,2.2rem)] leading-tight font-bold text-ink" dir="rtl">{t("ar", "cl_pqTitle")}</p>
              <p className="mt-1 text-[clamp(1rem,2.6vw,1.5rem)] font-semibold text-slate-500" dir="ltr">{t("fr", "cl_pqTitle")}</p>
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
          <p className="num mb-[4%] text-center text-sm text-slate-500" dir="ltr">{url.replace(/^https?:\/\//, "")}</p>
        </div>
      </article>
    </div>
  );
}
