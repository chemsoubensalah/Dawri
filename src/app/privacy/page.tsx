import LegalPage from "@/components/LegalPage";
import { getLang } from "@/lib/server/http";
import { privacyContent } from "@/lib/legal";

export const metadata = { title: "سياسة الخصوصية — Dawri" };

export default async function Privacy() {
  const lang = await getLang();
  return <LegalPage lang={lang} {...privacyContent(lang)} />;
}
