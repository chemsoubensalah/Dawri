/**
 * ألوان التطبيق: كلّ لون = سلّم كامل 50…950 يحلّ محلّ متغيّرات --color-brand-* على إطار الصفحة،
 * فتتبعه كلّ الأصناف (bg-brand-600، text-brand-700…) دون تعديلها.
 * اللون الخاصّ (custom) يُشتقّ سلّمه من لون واحد، مع تغميقه حتى يُقرأ النصّ الأبيض فوقه.
 */
import type { CSSProperties } from "react";
import type { PresetTheme, ShopLook } from "./domain/types";

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export const PALETTES: Record<PresetTheme, readonly string[]> = {
  emerald: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"],
  green: ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#052e16"],
  teal: ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a", "#042f2e"],
  cyan: ["#ecfeff", "#cffafe", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490", "#155e75", "#164e63", "#083344"],
  sky: ["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#075985", "#0c4a6e", "#082f49"],
  blue: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"],
  navy: ["#eef3fb", "#d9e3f5", "#b6c8ea", "#87a3d9", "#5a7ec4", "#3a5fa8", "#26478a", "#1f3a72", "#1b305d", "#17284c", "#0e1830"],
  indigo: ["#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81", "#1e1b4b"],
  violet: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
  purple: ["#faf5ff", "#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea", "#7e22ce", "#6b21a8", "#581c87", "#3b0764"],
  fuchsia: ["#fdf4ff", "#fae8ff", "#f5d0fe", "#f0abfc", "#e879f9", "#d946ef", "#c026d3", "#a21caf", "#86198f", "#701a75", "#4a044e"],
  pink: ["#fdf2f8", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843", "#500724"],
  rose: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337", "#4c0519"],
  red: ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d", "#450a0a"],
  orange: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12", "#431407"],
  // كهرماني بدرجة أغمق قليلاً كي يُقرأ النصّ الأبيض على 600
  amber: ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#d97706", "#b45309", "#92400e", "#78350f", "#5f2b0c", "#451a03"],
  brown: ["#fbf7f3", "#f3e9df", "#e6d2be", "#d3b393", "#bb8e66", "#a07148", "#855a37", "#6c482d", "#573b27", "#473122", "#281a11"],
  slate: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"],
};

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => "#" + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function luminance([r, g, b]: Rgb) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrastWithWhite = (c: Rgb) => 1.05 / (luminance(c) + 0.05);

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * سلّم 50…950 من لون واحد؛ الدرجة 600 = اللون نفسه بعد تغميقه إن لزم (تباين ≥ 3.5 مع الأبيض).
 * التغميق بالإضاءة (HSL) مع ميل الأصفر نحو الذهبي — كي لا يصير زيتونياً باهتاً.
 */
export function paletteFrom(hex: string): string[] {
  let base = toRgb(hex);
  let [h, s, l] = toHsl(base);
  for (let i = 0; i < 40 && contrastWithWhite(base) < 3.5; i++) {
    l -= 0.02;
    if (h > 38 && h < 75) h -= 1.2;
    base = fromHsl([h, s, Math.max(l, 0)]);
  }
  const tint = (t: number) => toHex(mix(base, WHITE, t));
  const shade = (t: number) => toHex(mix(base, BLACK, t));
  return [tint(0.94), tint(0.86), tint(0.72), tint(0.54), tint(0.32), tint(0.14), toHex(base), shade(0.18), shade(0.34), shade(0.5), shade(0.68)];
}

type ThemeSpec = Pick<ShopLook, "theme" | "custom">;

export function paletteOf(look: ThemeSpec): readonly string[] {
  if (look.theme === "custom") return look.custom ? paletteFrom(look.custom) : PALETTES.emerald;
  return PALETTES[look.theme] ?? PALETTES.emerald;
}

/** اللون الأساسي (600) لعرض العيّنة. */
export function swatch(look: ThemeSpec): string {
  return paletteOf(look)[6];
}

/** متغيّرات CSS للّون المختار — تُوضع على العنصر الجذر للصفحة. */
export function themeVars(look: ThemeSpec): CSSProperties {
  const p = paletteOf(look);
  const vars: Record<string, string> = {};
  STEPS.forEach((s, i) => (vars[`--color-brand-${s}`] = p[i]));
  // متغيّر مركّب: يُحسب حيث يُعرَّف، فيجب إعادة تعريفه هنا أيضاً
  vars["--shadow-brand"] = `0 10px 24px -10px ${p[6]}8c`;
  return vars as CSSProperties;
}

/** يطبّق اللون على عنصر قائم (معاينة حيّة في الإعدادات). */
export function applyTheme(el: HTMLElement, look: ThemeSpec) {
  for (const [k, v] of Object.entries(themeVars(look))) el.style.setProperty(k, String(v));
}
