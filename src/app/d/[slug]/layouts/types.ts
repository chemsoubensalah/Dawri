import type { ReactNode } from "react";
import type { Lang } from "@/lib/domain/types";
import type { PublicShopView } from "@/lib/server/service";

/**
 * عقد تصاميم شاشة القاعة: الغلاف (DisplayClient) يملك البيانات والساعة والأصوات،
 * وكلّ تصميم يرسم الشاشة كاملة من هذه الخصائص فقط.
 *
 * قواعد مشتركة لكلّ تصميم:
 * - لا أسماء مرضى أبداً (الخصوصية): أرقام فقط.
 * - الرقم الحالي يحمل data-testid="display-number".
 * - يُقرأ من 5–8 أمتار على تلفاز 1920×1080، ويعمل على هاتف 390px وبالطول.
 * - يتبع لون العيادة عبر أصناف brand-* (bg-brand-600…) أو var(--color-brand-*).
 * - العربية (rtl) والفرنسية (ltr): استعمل ms-/me-/start/end لا left/right.
 */
export interface LayoutProps {
  lang: Lang;
  /** بيانات حيّة تتحدّث كلّ 4 ثوانٍ */
  v: PublicShopView;
  /** «د. فلان» أو null إن لم يُكتب اسم الطبيب */
  doctor: string | null;
  /** «14:05» — فارغ قبل التركيب في المتصفّح */
  time: string;
  /** «الاثنين، 12 أكتوبر» — فارغ قبل التركيب */
  date: string;
  /** رمز QR لصفحة المرضى (SVG: وحدات #0b1b2b على أبيض) */
  qr: string;
  /** رقم نودي للتوّ: يُعرض نداءً بارزاً ~6 ثوانٍ ثمّ يعود null */
  callout: number | null;
  dismissCallout: () => void;
  /** النداء الصوتي (قراءة الرقم بصوت) */
  voice: boolean;
  toggleVoice: () => void;
}

export interface LayoutDef {
  Layout: (p: LayoutProps) => ReactNode;
  /** مصغّر 16:9 لبطاقة الاختيار في الإعدادات (يتبع لون العيادة) */
  Thumb: () => ReactNode;
}
