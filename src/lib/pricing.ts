/** سعر الاشتراك الشهري المعروض (بالدينار). يُضبط بالمتغيّر NEXT_PUBLIC_PRICE_DZD. */
export function priceDzd(): string {
  const raw = Number(process.env.NEXT_PUBLIC_PRICE_DZD ?? 2500);
  const n = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2500;
  // 2 500 دج — مسافة رقيقة بين الآلاف
  return `${n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} DA`;
}

export function priceNumber(): number {
  const raw = Number(process.env.NEXT_PUBLIC_PRICE_DZD ?? 2500);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2500;
}
