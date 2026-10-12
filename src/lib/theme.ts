/**
 * ألوان التطبيق: كلّ لون = سلّم كامل 50…950 يحلّ محلّ متغيّرات --color-brand-* على إطار الصفحة،
 * فتتبعه كلّ الأصناف (bg-brand-600، text-brand-700…) دون تعديلها.
 */
import type { CSSProperties } from "react";
import type { ThemeKey } from "./domain/types";

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export const PALETTES: Record<ThemeKey, readonly string[]> = {
  emerald: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"],
  teal: ["#f0fdfa", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a", "#042f2e"],
  sky: ["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7", "#0369a1", "#075985", "#0c4a6e", "#082f49"],
  blue: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"],
  indigo: ["#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81", "#1e1b4b"],
  violet: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
  rose: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337", "#4c0519"],
  orange: ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12", "#431407"],
  slate: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"],
};

/** اللون الأساسي (600) لعرض العيّنة. */
export function swatch(theme: ThemeKey): string {
  return PALETTES[theme][6];
}

/** متغيّرات CSS للّون المختار — تُوضع على العنصر الجذر للصفحة. */
export function themeVars(theme: ThemeKey): CSSProperties {
  const p = PALETTES[theme] ?? PALETTES.emerald;
  const vars: Record<string, string> = {};
  STEPS.forEach((s, i) => (vars[`--color-brand-${s}`] = p[i]));
  // متغيّر مركّب: يُحسب حيث يُعرَّف، فيجب إعادة تعريفه هنا أيضاً
  vars["--shadow-brand"] = `0 10px 24px -10px ${p[6]}8c`;
  return vars as CSSProperties;
}

/** يطبّق اللون على عنصر قائم (معاينة حيّة في الإعدادات). */
export function applyTheme(el: HTMLElement, theme: ThemeKey) {
  for (const [k, v] of Object.entries(themeVars(theme))) el.style.setProperty(k, String(v));
}
