import LegalPage from "@/components/LegalPage";
import { getLang } from "@/lib/server/http";
import { termsContent } from "@/lib/legal";
import { priceDzd, yearPriceDzd } from "@/lib/pricing";

export const metadata = { title: "شروط الاستعمال — Dawri" };

export default async function Terms() {
  const lang = await getLang();
  return <LegalPage lang={lang} {...termsContent(lang, priceDzd(), yearPriceDzd())} />;
}
