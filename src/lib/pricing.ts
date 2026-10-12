/**
 * الأسعار المعروضة (بالدينار). شهري: NEXT_PUBLIC_PRICE_DZD (افتراضياً 1000)،
 * سنوي: NEXT_PUBLIC_PRICE_YEAR_DZD (افتراضياً 9000 — أقلّ من 12 شهراً، وأقلّ من المنافسين).
 */
function envPrice(v: string | undefined, fallback: number): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export function priceNumber(): number {
  return envPrice(process.env.NEXT_PUBLIC_PRICE_DZD, 1000);
}

export function yearPriceNumber(): number {
  return envPrice(process.env.NEXT_PUBLIC_PRICE_YEAR_DZD, 9000);
}

/** «1 000 DA» — مسافة بين الآلاف */
export function formatDzd(n: number): string {
  return `${n.toLocaleString("fr-FR").replace(/[  ]/g, " ")} DA`;
}

export function priceDzd(): string {
  return formatDzd(priceNumber());
}

export function yearPriceDzd(): string {
  return formatDzd(yearPriceNumber());
}
