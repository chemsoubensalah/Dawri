import LangSwitch from "@/components/LangSwitch";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/server/http";
import NewShopForm from "./NewShopForm";

export const metadata = { title: "طابور جديد" };

export default async function NewShop() {
  const lang = await getLang();
  return (
    <main className="mx-auto max-w-xl space-y-5 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t(lang, "newTitle")}</h1>
        <LangSwitch lang={lang} />
      </header>
      <NewShopForm lang={lang} needsCode={Boolean(process.env.SIGNUP_CODE)} />
    </main>
  );
}
