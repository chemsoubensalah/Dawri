/** مشترك بين الخادم والرسوم: ألوان السلاسل (لوحة مُتحقَّق منها لعمى الألوان) وتنسيق الأرقام. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

const nf = new Intl.NumberFormat("fr-DZ");
export const fmtN = (v: number) => nf.format(v);
