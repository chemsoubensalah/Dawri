/**
 * سبب الزيارة: الطبيب يقرّر كيف يُسأل المريض (الإعدادات ← «سبب الزيارة»):
 * off = لا يُسأل، list = يختار من قائمة يكتبها الطبيب، text = يكتب ما يريد (نصّ قصير).
 * السبب لا يراه إلّا الطبيب والسكرتيرة، ويُمحى مع الاسم والهاتف بعد 30 يوماً.
 */
import { DomainError, type Shop, type ShopKind } from "./types";

export type ReasonMode = "off" | "list" | "text";

export interface ReasonConfig {
  mode: ReasonMode;
  /** لا يأخذ المريض رقماً ولا موعداً دون أن يجيب (السكرتيرة غير ملزمة) */
  required: boolean;
  /** اختيارات يكتبها الطبيب (وضع list) */
  options: string[];
}

export const REASON_TEXT_MAX = 120;
export const REASON_OPTION_MAX = 40;
export const REASON_OPTIONS_MAX = 12;

/** قبل أن يختار الطبيب: العيادات والمخابر يكتب فيها المريض سببه؛ الأنواع الأخرى لا تسأل. */
export function defaultReasonConfig(kind: ShopKind): ReasonConfig {
  return { mode: kind === "doctor" || kind === "dentist" || kind === "lab" ? "text" : "off", required: true, options: [] };
}

/** اقتراحات يضيفها الطبيب إلى قائمته بنقرة (مفاتيح نصوص i18n: vr_<key>) — لا تُعرض على المريض إلّا إن اختارها. */
export const REASON_SUGGESTIONS: Record<ShopKind, readonly string[]> = {
  doctor: ["consult", "followup", "results", "prescription", "certificate", "other"],
  dentist: ["consult", "treatment", "urgent", "other"],
  lab: ["sample", "pickup", "other"],
  barber: [],
  other: [],
};

/** رموز الإصدار السابق (قائمة ثابتة): ما حُفظ بها يُعرض باسمه المترجم. */
export const LEGACY_REASON_CODES = ["consult", "followup", "results", "prescription", "certificate", "treatment", "urgent", "sample", "pickup", "other"];

function cleanText(v: string): string {
  // بلا محارف تحكّم أو اتّجاه مخفيّة
  return v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
}

/** الإعداد المحفوظ (قد يكون فارغاً أو قديماً) + القيم الافتراضية حسب نوع العيادة. */
export function readReasonConfig(kind: ShopKind, raw: unknown): ReasonConfig {
  const d = defaultReasonConfig(kind);
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ReasonConfig, unknown>>;
  const mode = o.mode === "off" || o.mode === "list" || o.mode === "text" ? o.mode : d.mode;
  const options = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, REASON_OPTIONS_MAX) : [];
  return { mode, required: typeof o.required === "boolean" ? o.required : d.required, options };
}

export function reasonConfigOf(shop: Pick<Shop, "kind" | "reasonCfg">): ReasonConfig {
  return readReasonConfig(shop.kind, shop.reasonCfg);
}

/** ما يراه المريض: قائمة بلا اختيارات = لا سؤال. */
export function activeReasonConfig(c: ReasonConfig): ReasonConfig {
  return c.mode === "list" && c.options.length === 0 ? { ...c, mode: "off" } : c;
}

/** إعداد يرسله الطبيب من صفحة الإعدادات. */
export function cleanReasonConfig(v: unknown): ReasonConfig {
  const o = (v && typeof v === "object" ? v : null) as Partial<Record<keyof ReasonConfig, unknown>> | null;
  if (!o || (o.mode !== "off" && o.mode !== "list" && o.mode !== "text") || typeof o.required !== "boolean") throw new DomainError("invalid_settings");
  const raw = o.options ?? [];
  if (!Array.isArray(raw) || raw.length > REASON_OPTIONS_MAX) throw new DomainError("invalid_settings");
  const options: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") throw new DomainError("invalid_settings");
    const s = cleanText(x);
    if (s.length > REASON_OPTION_MAX) throw new DomainError("invalid_settings");
    if (s && !options.includes(s)) options.push(s);
  }
  if (o.mode === "list" && options.length === 0) throw new DomainError("reason_no_options");
  return { mode: o.mode, required: o.required, options };
}

/**
 * سبب يرسله المريض أو السكرتيرة حسب إعداد الطبيب.
 * الغياب مقبول (نسخ قديمة من الصفحة، أو السكرتيرة): الإلزام في النموذج. وضع off يتجاهل أيّ قيمة.
 */
export function cleanReason(c: ReasonConfig, v: unknown): string | null {
  const cfg = activeReasonConfig(c);
  if (cfg.mode === "off" || v == null || v === "") return null;
  if (typeof v !== "string") throw new DomainError("invalid_reason");
  const s = cleanText(v);
  if (!s) return null;
  if (cfg.mode === "list") {
    if (!cfg.options.includes(s)) throw new DomainError("invalid_reason");
    return s;
  }
  if (s.length > REASON_TEXT_MAX) throw new DomainError("reason_too_long");
  return s;
}
