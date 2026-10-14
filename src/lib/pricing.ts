/**
 * الأسعار المعروضة (بالدينار). خطّتان منفصلتان:
 * - عيادة طبيب واحد (cabinet): شهري NEXT_PUBLIC_PRICE_DZD (1000)، سنوي NEXT_PUBLIC_PRICE_YEAR_DZD (10000).
 * - عيادة متعدّدة الأطبّاء (clinique، حتى MAX_DOCTORS أطبّاء باشتراك واحد):
 *   شهري NEXT_PUBLIC_CLINIC_PRICE_DZD (2000)، سنوي NEXT_PUBLIC_CLINIC_PRICE_YEAR_DZD (20000).
 * كلاهما: شهر مجّاني (TRIAL_DAYS)، بلا عمولة.
 */
function envPrice(v: string | undefined, fallback: number): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export type PlanKind = "cabinet" | "clinic";

/** مدّة التجربة المجّانية لكلّ حساب جديد (طبيب واحد أو عيادة). المصدر الوحيد للرقم. */
export const TRIAL_DAYS = 30;

/** حدّ أطبّاء خطّة العيادة (شاشة القاعة مصمّمة حتى 8). المصدر الوحيد للرقم في النصوص والواجهة. */
export const MAX_DOCTORS = 8;

export function priceNumber(): number {
  return envPrice(process.env.NEXT_PUBLIC_PRICE_DZD, 1000);
}

export function yearPriceNumber(): number {
  return envPrice(process.env.NEXT_PUBLIC_PRICE_YEAR_DZD, 10000);
}

export function clinicPriceNumber(): number {
  return envPrice(process.env.NEXT_PUBLIC_CLINIC_PRICE_DZD, 2000);
}

export function clinicYearPriceNumber(): number {
  return envPrice(process.env.NEXT_PUBLIC_CLINIC_PRICE_YEAR_DZD, 20000);
}

/** «1 000 DA» — مسافة بين الآلاف */
export function formatDzd(n: number): string {
  return `${n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} DA`;
}

export function priceDzd(): string {
  return formatDzd(priceNumber());
}

export function yearPriceDzd(): string {
  return formatDzd(yearPriceNumber());
}

export function clinicPriceDzd(): string {
  return formatDzd(clinicPriceNumber());
}

export function clinicYearPriceDzd(): string {
  return formatDzd(clinicYearPriceNumber());
}

/** نسبة التوفير في السنوي مقارنةً بـ 12 شهراً (مثلاً 17 لـ 1000 / 10000). */
export function yearSavePct(month: number, year: number): number {
  return Math.max(0, Math.round((1 - year / (month * 12)) * 100));
}
