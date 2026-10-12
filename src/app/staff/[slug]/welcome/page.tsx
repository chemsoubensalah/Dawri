import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, ArrowRight, Clock3, MonitorPlay, PartyPopper, Printer, Smartphone, UserRoundPen } from "lucide-react";
import StaffFrame from "@/components/StaffFrame";
import { IconBubble } from "@/components/ui";
import { t, type DictKey, drTitle } from "@/lib/i18n";
import { baseUrl, getLang, staffShop } from "@/lib/server/http";

export const metadata = { title: "مرحباً", robots: { index: false } };

/** أوّل صفحة بعد إنشاء العيادة: قائمة خطوات قصيرة للبدء. */
export default async function Welcome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await staffShop(slug);
  if (!shop) redirect(`/staff/${slug}`);
  const lang = await getLang(shop.defaultLang);
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  const patientUrl = `${await baseUrl()}/s/${shop.slug}`;
  const qr = await QRCode.toString(patientUrl, { type: "svg", margin: 1, width: 180 });

  const steps: { icon: React.ReactNode; title: DictKey; body: DictKey; href: string; cta: DictKey; external?: boolean }[] = [
    { icon: <UserRoundPen size={22} />, title: "wl_s1", body: "wl_s1b", href: `/staff/${shop.slug}/settings#profile`, cta: "wl_open" },
    { icon: <Clock3 size={22} />, title: "wl_s2", body: "wl_s2b", href: `/staff/${shop.slug}/settings#hours`, cta: "wl_open" },
    { icon: <Printer size={22} />, title: "wl_s3", body: "wl_s3b", href: `/staff/${shop.slug}/qr`, cta: "wl_open" },
    { icon: <MonitorPlay size={22} />, title: "wl_s4", body: "wl_s4b", href: `/d/${shop.slug}`, cta: "wl_open", external: true },
  ];

  return (
    <StaffFrame lang={lang} slug={shop.slug} name={shop.name} doctor={drTitle(lang, shop.kind, shop.profile.doctorName)} theme={shop.look.theme} active="welcome">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <div className="card flex items-center gap-4 bg-gradient-to-br from-brand-600 to-brand-800 text-white ring-0">
            <PartyPopper size={40} className="shrink-0 text-brand-200" />
            <div>
              <h1 className="text-2xl font-bold">{t(lang, "wl_title")}</h1>
              <p className="text-brand-100">{t(lang, "wl_sub")}</p>
            </div>
          </div>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className="card flex items-center gap-4">
                <IconBubble>{s.icon}</IconBubble>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    <span className="num text-slate-400">{i + 1}.</span> {t(lang, s.title)}
                  </div>
                  <div className="text-sm text-slate-600">{t(lang, s.body)}</div>
                </div>
                <Link href={s.href} target={s.external ? "_blank" : undefined} className="btn-secondary btn-sm shrink-0">
                  {t(lang, s.cta)} <Arrow size={15} />
                </Link>
              </li>
            ))}
          </ol>
          <Link href={`/staff/${shop.slug}`} className="btn-primary w-full text-lg">
            {t(lang, "wl_go")} <Arrow size={20} />
          </Link>
        </section>
        <aside className="card text-center">
          <IconBubble size="lg"><Smartphone size={26} /></IconBubble>
          <h2 className="mt-3 text-lg font-bold">{t(lang, "wl_try")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t(lang, "wl_tryb")}</p>
          <div className="mx-auto mt-4 w-44 rounded-2xl bg-white p-2 ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: qr }} />
          <a href={patientUrl} target="_blank" className="mt-3 block truncate text-sm font-semibold text-brand-700 hover:underline" dir="ltr">
            {patientUrl.replace(/^https?:\/\//, "")}
          </a>
        </aside>
      </div>
    </StaffFrame>
  );
}
