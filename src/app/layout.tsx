import type { Metadata, Viewport } from "next";
import { getLang } from "@/lib/server/http";
import { dirOf } from "@/lib/i18n";
import SwRegister from "@/components/SwRegister";
import "./globals.css";

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
    <html lang={lang} dir={dirOf(lang)}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
