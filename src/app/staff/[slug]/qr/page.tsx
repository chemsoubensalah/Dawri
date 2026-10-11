import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { t } from "@/lib/i18n";
import { baseUrl, staffShop } from "@/lib/server/http";
import PrintButton from "./PrintButton";

export const metadata = { title: "QR", robots: { index: false } };

/** ملصق الباب — بالعربية والفرنسية معاً. رمز الباب يسمح بتسجيل «وصلت». */
export default async function QrPoster({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const base = await baseUrl();
  const doorUrl = `${base}/s/${shop.slug}?c=${encodeURIComponent(shop.doorCode)}`;
  const shareUrl = `${base}/s/${shop.slug}`;
  const svg = await QRCode.toString(doorUrl, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 320 });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <a href={`/staff/${shop.slug}`} className="text-brand-700 underline">← {shop.name}</a>
        <PrintButton label={`${t("ar", "print")} / ${t("fr", "print")}`} />
      </div>
      <article className="space-y-6 rounded-3xl border-4 border-brand-600 bg-white p-8 text-center">
        <div className="text-4xl font-black text-brand-700">دوري · Dawri</div>
        <h1 className="text-3xl font-extrabold">{shop.name}</h1>
        <div className="space-y-1">
          <p className="text-2xl font-bold" dir="rtl">{t("ar", "posterTitle")}</p>
          <p className="text-xl font-semibold text-slate-600" dir="ltr">{t("fr", "posterTitle")}</p>
        </div>
        <div className="mx-auto w-72" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="grid gap-4 text-start sm:grid-cols-2">
          <ol className="space-y-1 text-lg" dir="rtl">
            <li>{t("ar", "posterStep1")}</li>
            <li>{t("ar", "posterStep2")}</li>
            <li>{t("ar", "posterStep3")}</li>
          </ol>
          <ol className="space-y-1 text-lg" dir="ltr">
            <li>{t("fr", "posterStep1")}</li>
            <li>{t("fr", "posterStep2")}</li>
            <li>{t("fr", "posterStep3")}</li>
          </ol>
        </div>
        <p className="rounded-2xl bg-brand-50 p-3 text-lg font-semibold text-brand-900">
          <span dir="rtl" className="block">{t("ar", "posterArrived")}</span>
          <span dir="ltr" className="block">{t("fr", "posterArrived")}</span>
        </p>
        <p className="text-sm text-slate-500" dir="rtl">{t("ar", "noSmartphone")}</p>
      </article>
      <div className="no-print mt-6 space-y-1 text-sm text-slate-600">
        <p>{t("ar", "shareLink")} / {t("fr", "shareLink")}:</p>
        <p className="num rounded-xl bg-white p-3 ring-1 ring-slate-200" dir="ltr">{shareUrl}</p>
      </div>
    </main>
  );
}
