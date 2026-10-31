/**
 * إعدادات طابعة التذاكر (الإعدادات ← «طباعة التذاكر»): عرض الورق، حجم الكتابة، ورمز QR.
 * تُطبَّق على كلّ ورقة: src/app/staff/[slug]/print.
 */
import { DomainError } from "./types";

export type PaperWidth = 58 | 80;
export type TextSize = "s" | "m" | "l";

export interface PrintConfig {
  paper: PaperWidth;
  size: TextSize;
  /** رمز QR ليتابع المريض دوره/موعده على هاتفه (إخفاؤه يوفّر الورق) */
  qr: boolean;
}

export const DEFAULT_PRINT: PrintConfig = { paper: 80, size: "m", qr: true };

/** مساحة الطباعة الفعلية لرأس الطابعة: ورق 80 مم ← 72 مم، 58 مم ← 48 مم */
export const PRINTABLE_MM: Record<PaperWidth, number> = { 80: 72, 58: 48 };
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.85, m: 1, l: 1.2 };

const isPaper = (v: unknown): v is PaperWidth => v === 58 || v === 80;
const isSize = (v: unknown): v is TextSize => v === "s" || v === "m" || v === "l";

/** الإعداد المحفوظ (قد يكون فارغاً) + القيم الافتراضية. */
export function readPrintConfig(raw: unknown): PrintConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof PrintConfig, unknown>>;
  const paper = Number(o.paper);
  return {
    paper: isPaper(paper) ? paper : DEFAULT_PRINT.paper,
    size: isSize(o.size) ? o.size : DEFAULT_PRINT.size,
    qr: typeof o.qr === "boolean" ? o.qr : DEFAULT_PRINT.qr,
  };
}

/** إعداد يرسله الطبيب من صفحة الإعدادات. */
export function cleanPrintConfig(v: unknown): PrintConfig {
  const o = (v && typeof v === "object" ? v : null) as Partial<Record<keyof PrintConfig, unknown>> | null;
  const paper = Number(o?.paper);
  if (!o || !isPaper(paper) || !isSize(o.size) || typeof o.qr !== "boolean") throw new DomainError("invalid_settings");
  return { paper, size: o.size, qr: o.qr };
}
