import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { DomainError, isDisplayStyle, isHexColor, isTheme } from "@/lib/domain/types";
import { baseUrl, getLang } from "@/lib/server/http";
import { publicShop } from "@/lib/server/service";
import DisplayClient from "./DisplayClient";

export const metadata = { title: "شاشة القاعة", robots: { index: false } };

/**
 * L'écran normal a besoin d'un navigateur récent (couches CSS, couleurs oklch). Sinon — vieille WebView Android
 * d'un boîtier TV, quand TV Bro n'utilise pas GeckoView — la page s'afficherait en texte brut : on bascule sur
 * /d/[slug]/lite, écrit pour tous les navigateurs. Script ES5, exécuté avant tout le reste.
 */
const LEGACY_REDIRECT = `(function(){try{var c=window.CSS;var ok=!!(c&&c.supports&&c.supports('color','oklch(50% 0.1 100)')&&typeof window.CSSLayerBlockRule!=='undefined');if(!ok)location.replace(location.pathname.replace(/\\/+$/,'')+'/lite'+location.search)}catch(e){}})();`;

/** شاشة القاعة (تلفاز أو هاتف قديم): الرقم الحالي فقط — لا أسماء. */
export default async function Display({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  // ?style=…&theme=…&custom=rrggbb للمعاينة من الإعدادات قبل الحفظ
  const sp = await searchParams;
  const custom = sp.custom ? `#${sp.custom}` : null;
  const theme = isTheme(sp.theme) && (sp.theme !== "custom" || isHexColor(custom)) ? sp.theme : null;
  const preview = {
    skin: isDisplayStyle(sp.style) ? sp.style : undefined,
    look: theme ? { theme, custom: isHexColor(custom) ? custom : null } : undefined,
  };
  try {
    const { shop, view } = await publicShop(slug);
    // صفحة عامّة ← رابط المرضى العادي (رمز الباب السرّي يبقى على الملصق المطبوع فقط)
    const url = `${await baseUrl()}/s/${shop.slug}`;
    const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#0b1b2b", light: "#ffffff" } });
    return (
      <>
        {/* navigateur trop ancien pour l'écran normal (WebView d'un boîtier TV) : écran de secours, sans dépendances */}
        <script dangerouslySetInnerHTML={{ __html: LEGACY_REDIRECT }} />
        <DisplayClient lang={await getLang(shop.defaultLang)} initial={view} qr={qr} preview={preview} />
      </>
    );
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}
