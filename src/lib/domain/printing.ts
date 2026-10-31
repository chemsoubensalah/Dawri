/**
 * إعدادات طابعة التذاكر (الإعدادات ← «طباعة التذاكر»): عرض الورق، حجم الكتابة، لغة الورقة،
 * و«تصميم» كلّ ورقة: الطبيب يُظهر ويُخفي العناصر، يرتّبها، يغيّر حجمها وسُمكها ومحاذاتها،
 * يكتب نصوصه بدل العناوين، ويضيف أسطراً وخطوطاً فاصلة. تُطبَّق على كلّ ورقة: src/app/staff/[slug]/print.
 */
import { DomainError } from "./types";

export type PaperWidth = 58 | 80;
export type TextSize = "s" | "m" | "l";
/** auto = لغة واجهة من يطبع؛ both = العربية وتحتها الفرنسية */
export type PrintLang = "auto" | "ar" | "fr" | "both";

export type Layout = "ticket" | "appt";
export type BlockSize = "xs" | "s" | "m" | "l" | "xl";
/** يمين/وسط/يسار كما تُرى على الورق (أوضح للطبيب من «بداية/نهاية») */
export type BlockAlign = "right" | "center" | "left";

/** سطر في الورقة: عنصر جاهز (clinic, number…) أو ما يضيفه الطبيب: text-1 (نصّ)، line-1 (خطّ فاصل). */
export interface PrintBlock {
  key: string;
  show: boolean;
  size: BlockSize;
  bold: boolean;
  align: BlockAlign;
  /** نصّ الطبيب بدل العنوان الافتراضي (label، qr، note)، أو محتوى سطر «نصّ» أضافه */
  text: string | null;
}

export interface PrintConfig {
  paper: PaperWidth;
  size: TextSize;
  /** رمز QR (الإعداد الأوّل، قبل التصميم): يحدّد التصميم الافتراضي فقط */
  qr: boolean;
  lang: PrintLang;
  /** تصميم تذكرة الطابور وورقة الموعد */
  ticket: PrintBlock[];
  appt: PrintBlock[];
}

/** مساحة الطباعة الفعلية لرأس الطابعة: ورق 80 مم ← 72 مم، 58 مم ← 48 مم */
export const PRINTABLE_MM: Record<PaperWidth, number> = { 80: 72, 58: 48 };
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.85, m: 1, l: 1.2 };
export const BLOCK_SCALE: Record<BlockSize, number> = { xs: 0.7, s: 0.85, m: 1, l: 1.2, xl: 1.45 };

export const ELEMENTS: Record<Layout, readonly string[]> = {
  ticket: ["clinic", "doctor", "specialty", "label", "number", "name", "priority", "ahead", "current", "date", "qr", "note", "footer"],
  appt: ["clinic", "doctor", "specialty", "label", "date", "time", "name", "address", "phone", "qr", "note", "footer"],
};
/** لا يُخفى أبداً: الرقم في التذكرة، والساعة في ورقة الموعد */
export const REQUIRED: Record<Layout, string> = { ticket: "number", appt: "time" };
/** عناصر يكتب الطبيب نصّها بدل النصّ الافتراضي */
export const EDITABLE: ReadonlySet<string> = new Set(["label", "qr", "note"]);
export const LABEL_MAX = 60;
export const TEXT_MAX = 120;
/** أسطر النصوص والخطوط التي يضيفها الطبيب، لكلّ ورقة */
export const CUSTOM_MAX = 8;
const CUSTOM_KEY = /^(text|line)-\d{1,3}$/;
export const isCustomKey = (k: string) => CUSTOM_KEY.test(k);

const blk = (key: string, show = true, bold = false): PrintBlock => ({ key, show, size: "m", bold, align: "center", text: null });

/** التصميم الافتراضي = الورقة كما كانت قبل المصمّم (اسم الطبيب وتخصّصه مخفيّان: طلب الطبيب). */
export function defaultLayout(kind: Layout, qr = true): PrintBlock[] {
  return kind === "ticket"
    ? [
        blk("clinic", true, true), blk("doctor", false), blk("specialty", false), blk("line-1"),
        blk("label", true, true), blk("number", true, true), blk("name", true, true), blk("priority", true, true),
        blk("ahead", true, true), blk("current"), blk("date"), blk("line-2"),
        blk("qr", qr, true), blk("line-3"), blk("note", true, true), blk("footer"),
      ]
    : [
        blk("clinic", true, true), blk("doctor", false), blk("specialty", false), blk("line-1"),
        blk("label", true, true), blk("date", true, true), blk("time", true, true), blk("name", true, true),
        blk("address"), blk("phone", true, true), blk("line-2"),
        blk("qr", qr, true), blk("line-3"), blk("note", true, true), blk("footer"),
      ];
}

export const DEFAULT_PRINT: PrintConfig = { paper: 80, size: "m", qr: true, lang: "auto", ticket: defaultLayout("ticket"), appt: defaultLayout("appt") };

function cleanLine(v: string): string {
  // بلا محارف تحكّم أو اتّجاه مخفيّة
  return v.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
}

const isBlockSize = (v: unknown): v is BlockSize => v === "xs" || v === "s" || v === "m" || v === "l" || v === "xl";
const isAlign = (v: unknown): v is BlockAlign => v === "right" || v === "center" || v === "left";

/** سطر واحد. strict = من صفحة الإعدادات (قيمة خاطئة ← خطأ)؛ وإلّا (المحفوظ) تُستبدل بالافتراضي. */
function readBlock(x: unknown, strict: boolean): PrintBlock | null {
  const bad = () => {
    if (strict) throw new DomainError("invalid_settings");
    return null;
  };
  if (!x || typeof x !== "object") return bad();
  const o = x as Partial<Record<keyof PrintBlock, unknown>>;
  if (typeof o.key !== "string" || !/^[a-z]+(-\d{1,3})?$/.test(o.key)) return bad();
  if (strict && (typeof o.show !== "boolean" || !isBlockSize(o.size) || typeof o.bold !== "boolean" || !isAlign(o.align))) return bad();
  const custom = isCustomKey(o.key);
  let text: string | null = null;
  if (typeof o.text === "string" && !o.key.startsWith("line-")) {
    const t = cleanLine(o.text);
    const max = custom ? TEXT_MAX : LABEL_MAX;
    if (t.length > max) {
      if (strict) throw new DomainError("invalid_settings");
      text = t.slice(0, max);
    } else text = t || null;
  }
  return {
    key: o.key,
    show: typeof o.show === "boolean" ? o.show : true,
    size: isBlockSize(o.size) ? o.size : "m",
    bold: typeof o.bold === "boolean" ? o.bold : false,
    align: isAlign(o.align) ? o.align : "center",
    text: custom || EDITABLE.has(o.key) ? text : null,
  };
}

/**
 * تصميم ورقة: عناصر معروفة فقط، بلا تكرار، أسطر الطبيب محدودة، نصّ فارغ يسقط؛
 * عنصر جديد في النظام لم يكن في التصميم المحفوظ يُضاف مخفيّاً؛ والرقم/الساعة ظاهر دائماً.
 */
function readLayout(kind: Layout, raw: unknown, qr: boolean, strict = false): PrintBlock[] {
  if (!Array.isArray(raw)) {
    if (strict && raw !== undefined) throw new DomainError("invalid_settings");
    return defaultLayout(kind, qr);
  }
  if (strict && raw.length > ELEMENTS[kind].length + CUSTOM_MAX) throw new DomainError("invalid_settings");
  const known = new Set(ELEMENTS[kind]);
  const out: PrintBlock[] = [];
  const seen = new Set<string>();
  let custom = 0;
  for (const x of raw.slice(0, 60)) {
    const b = readBlock(x, strict);
    if (!b || seen.has(b.key)) continue;
    const isCustom = isCustomKey(b.key);
    if (!known.has(b.key) && !isCustom) continue;
    if (b.key.startsWith("text-") && !b.text) continue;
    if (isCustom && ++custom > CUSTOM_MAX) continue;
    seen.add(b.key);
    out.push(b);
  }
  for (const d of defaultLayout(kind, qr)) if (known.has(d.key) && !seen.has(d.key)) out.push({ ...d, show: false });
  return out.map((b) => (b.key === REQUIRED[kind] ? { ...b, show: true } : b));
}

const isPaper = (v: unknown): v is PaperWidth => v === 58 || v === 80;
const isSize = (v: unknown): v is TextSize => v === "s" || v === "m" || v === "l";
const isLang = (v: unknown): v is PrintLang => v === "auto" || v === "ar" || v === "fr" || v === "both";

/** الإعداد المحفوظ (قد يكون فارغاً) + القيم الافتراضية. */
export function readPrintConfig(raw: unknown): PrintConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof PrintConfig, unknown>>;
  const paper = Number(o.paper);
  const qr = typeof o.qr === "boolean" ? o.qr : DEFAULT_PRINT.qr;
  return {
    paper: isPaper(paper) ? paper : DEFAULT_PRINT.paper,
    size: isSize(o.size) ? o.size : DEFAULT_PRINT.size,
    qr,
    lang: isLang(o.lang) ? o.lang : DEFAULT_PRINT.lang,
    ticket: readLayout("ticket", o.ticket, qr),
    appt: readLayout("appt", o.appt, qr),
  };
}

/** إعداد يرسله الطبيب من صفحة الإعدادات. */
export function cleanPrintConfig(v: unknown): PrintConfig {
  const o = (v && typeof v === "object" ? v : null) as Partial<Record<keyof PrintConfig, unknown>> | null;
  const paper = Number(o?.paper);
  // lang غائب (صفحة إعدادات قديمة مفتوحة): الافتراضي
  const lang = o?.lang === undefined ? DEFAULT_PRINT.lang : o.lang;
  if (!o || !isPaper(paper) || !isSize(o.size) || typeof o.qr !== "boolean" || !isLang(lang)) throw new DomainError("invalid_settings");
  // التصميم غائب (صفحة إعدادات قديمة): الافتراضي
  return { paper, size: o.size, qr: o.qr, lang, ticket: readLayout("ticket", o.ticket, o.qr, true), appt: readLayout("appt", o.appt, o.qr, true) };
}
