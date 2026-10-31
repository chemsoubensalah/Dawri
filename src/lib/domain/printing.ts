/**
 * إعدادات طابعة التذاكر (الإعدادات ← «طباعة التذاكر»): عرض الورق، حجم الكتابة، رمز QR، ولغة الورقة.
 * تُطبَّق على كلّ ورقة: src/app/staff/[slug]/print.
 */
import { DomainError } from "./types";

export type PaperWidth = 58 | 80;
export type TextSize = "s" | "m" | "l";
/** auto = لغة واجهة من يطبع؛ both = العربية وتحتها الفرنسية */
export type PrintLang = "auto" | "ar" | "fr" | "both";

export interface PrintConfig {
  paper: PaperWidth;
  size: TextSize;
  /** رمز QR ليتابع المريض دوره/موعده على هاتفه (إخفاؤه يوفّر الورق) */
  qr: boolean;
  lang: PrintLang;
}

export const DEFAULT_PRINT: PrintConfig = { paper: 80, size: "m", qr: true, lang: "auto" };

/** مساحة الطباعة الفعلية لرأس الطابعة: ورق 80 مم ← 72 مم، 58 مم ← 48 مم */
export const PRINTABLE_MM: Record<PaperWidth, number> = { 80: 72, 58: 48 };
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.85, m: 1, l: 1.2 };

const isPaper = (v: unknown): v is PaperWidth => v === 58 || v === 80;
const isSize = (v: unknown): v is TextSize => v === "s" || v === "m" || v === "l";
const isLang = (v: unknown): v is PrintLang => v === "auto" || v === "ar" || v === "fr" || v === "both";

/** الإعداد المحفوظ (قد يكون فارغاً) + القيم الافتراضية. */
export function readPrintConfig(raw: unknown): PrintConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof PrintConfig, unknown>>;
  const paper = Number(o.paper);
  return {
    paper: isPaper(paper) ? paper : DEFAULT_PRINT.paper,
    size: isSize(o.size) ? o.size : DEFAULT_PRINT.size,
    qr: typeof o.qr === "boolean" ? o.qr : DEFAULT_PRINT.qr,
    lang: isLang(o.lang) ? o.lang : DEFAULT_PRINT.lang,
  };
}

/** إعداد يرسله الطبيب من صفحة الإعدادات. */
export function cleanPrintConfig(v: unknown): PrintConfig {
  const o = (v && typeof v === "object" ? v : null) as Partial<Record<keyof PrintConfig, unknown>> | null;
  const paper = Number(o?.paper);
  // lang غائب (صفحة إعدادات قديمة مفتوحة): الافتراضي
  const lang = o?.lang === undefined ? DEFAULT_PRINT.lang : o.lang;
  if (!o || !isPaper(paper) || !isSize(o.size) || typeof o.qr !== "boolean" || !isLang(lang)) throw new DomainError("invalid_settings");
  return { paper, size: o.size, qr: o.qr, lang };
}
