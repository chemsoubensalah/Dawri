import { describe, expect, it } from "vitest";
import { readLook } from "@/lib/domain/types";
import { paletteFrom, paletteOf, PALETTES, themeVars } from "@/lib/theme";

const lum = (hex: string) => {
  const f = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(1) + 0.7152 * f(3) + 0.0722 * f(5);
};
const contrastWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);

describe("ألوان التطبيق", () => {
  it("كلّ لون جاهز له 11 درجة، ونصّ أبيض مقروء على 600", () => {
    for (const [name, p] of Object.entries(PALETTES)) {
      expect(p, name).toHaveLength(11);
      expect(contrastWhite(p[6]), name).toBeGreaterThanOrEqual(3);
    }
  });

  it("اللون الخاصّ: سلّم من الفاتح إلى الغامق، ويُغمَّق إن كان فاتحاً جدّاً", () => {
    for (const hex of ["#ffeb3b", "#00e5ff", "#7b1fa2", "#000000", "#ffffff"]) {
      const p = paletteFrom(hex);
      expect(p).toHaveLength(11);
      for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      for (let i = 1; i < p.length; i++) expect(lum(p[i])).toBeLessThanOrEqual(lum(p[i - 1]) + 1e-9);
      expect(contrastWhite(p[6])).toBeGreaterThanOrEqual(3.5);
    }
  });

  it("المتغيّرات تغطّي كلّ الدرجات، وقراءة المظهر تتحمّل القيم الفاسدة", () => {
    const vars = themeVars({ theme: "custom", custom: "#123456" }) as Record<string, string>;
    expect(Object.keys(vars).filter((k) => k.startsWith("--color-brand-"))).toHaveLength(11);
    expect(vars["--color-brand-600"]).toBe("#123456");
    expect(paletteOf({ theme: "custom", custom: null })).toBe(PALETTES.emerald);
    expect(readLook({ theme: "custom" })).toEqual({ theme: "emerald", custom: null, display: "night" });
    expect(readLook({ theme: "navy", custom: "#ABCDEF", display: "led" })).toEqual({ theme: "navy", custom: "#abcdef", display: "led" });
    expect(readLook("garbage")).toEqual({ theme: "emerald", custom: null, display: "night" });
  });
});
