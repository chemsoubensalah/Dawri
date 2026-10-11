import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import { getLang } from "@/lib/server/http";
import { dirOf } from "@/lib/i18n";
import SwRegister from "@/components/SwRegister";
import "./globals.css";

// خطّ عربي/لاتيني حديث، يُخدَم من موقعنا نفسه (لا طلبات إلى Google عند الزيارة)
const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-readex",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "دوري — Dawri", template: "%s · دوري" },
  description: "الطابور الإلكتروني: خذ رقمك من هاتفك وتعال حين يقترب دورك.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/180" },
  appleWebApp: { capable: true, title: "دوري", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dirOf(lang)} className={readex.variable}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
