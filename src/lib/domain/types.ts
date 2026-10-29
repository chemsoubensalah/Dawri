export type Lang = "ar" | "fr";

export type TicketStatus =
  | "pending_approval" // ينتظر موافقة السكرتيرة (كثير الغياب)
  | "waiting" // في الطابور
  | "called" // نودي الآن (الزبون الحالي)
  | "deferred" // نودي ولم يحضر: مؤجَّل، أمامه مهلة للعودة
  | "done" // خُدم
  | "cancelled" // ألغاه الزبون أو السكرتيرة
  | "no_show" // غاب (يُحسب في عدّاد الغياب)
  | "expired" // انتهى اليوم قبل دوره (لا يُحسب غياباً)
  | "rejected"; // رفضته السكرتيرة

export const OPEN_STATUSES: TicketStatus[] = ["pending_approval", "waiting", "called", "deferred"];

export type TicketSource = "online" | "desk";

export interface Ticket {
  id: string;
  shopId: string;
  day: string;
  number: number;
  name: string;
  phone: string | null;
  lang: Lang;
  source: TicketSource;
  status: TicketStatus;
  /** أُجِّل لأنّه لم يردّ على سؤال «هل ما زلت قادماً؟» — يُتخطّى حتى يؤكّد. */
  held: boolean;
  /** صاحب موعد وصل: يتقدّم الطابور قبل بقيّة الأرقام (انظر queueOrder). */
  priority?: boolean;
  /** لحظة منح الأولوية (وصول صاحب الموعد) — ترتيب أصحاب المواعيد بينهم؛ null = createdAt. */
  priorityAt?: Date | null;
  createdAt: Date;
  calledAt: Date | null;
  doneAt: Date | null;
  deferredAt: Date | null;
  arrivedAt: Date | null;
  confirmAskedAt: Date | null;
  confirmedAt: Date | null;
  notifiedSoonAt: Date | null;
  closedAt: Date | null;
  /** واتساب: رمز ربط التذكرة، ومعرّف المريض، ونافذة الـ24 ساعة */
  waCode: string | null;
  waUserId: string | null;
  waPhone: string | null;
  waWindowUntil: Date | null;
  waOptOut: boolean;
}

export type TicketPatch = Partial<
  Pick<
    Ticket,
    | "status"
    | "held"
    | "calledAt"
    | "doneAt"
    | "deferredAt"
    | "arrivedAt"
    | "confirmAskedAt"
    | "confirmedAt"
    | "notifiedSoonAt"
    | "closedAt"
  >
>;

/** [افتتاح, إغلاق] بصيغة "HH:MM" بتوقيت الجزائر. */
export type Interval = [string, string];
/** المفتاح: يوم الأسبوع 0=الأحد … 6=السبت. */
export type WeeklyHours = Record<string, Interval[]>;

export interface ShopSettings {
  /** يُسأل «هل ما زلت قادماً؟» حين يبقى أمامه هذا العدد. */
  confirmAhead: number;
  /** دقائق انتظار الردّ قبل تأجيل الدور. */
  confirmTimeoutMin: number;
  /** تُرسل «تعال الآن» حين يبقى أمامه هذا العدد. */
  notifyAhead: number;
  /** نودي ولم يؤكّد وصوله خلال هذه الدقائق ← يُتخطّى تلقائياً (0 = معطّل). */
  callGraceMin: number;
  /** المؤجَّل يستطيع العودة خلال هذه الدقائق، ثمّ تنتهي تذكرته. */
  lateWindowMin: number;
  /** بعد هذا العدد من الغيابات تحتاج تذكرته موافقة السكرتيرة. */
  noShowLimit: number;
  /** مدّة الزبون الافتراضية قبل أن تتوفّر بيانات اليوم. */
  defaultServiceMin: number;
  /** أقصى عدد تذاكر في اليوم (0 = بلا حدّ). السكرتيرة تستطيع الإضافة يدوياً بعده. */
  dailyLimit: number;
}

export const DEFAULT_SETTINGS: ShopSettings = {
  confirmAhead: 5,
  confirmTimeoutMin: 10,
  notifyAhead: 3,
  callGraceMin: 5,
  lateWindowMin: 15,
  noShowLimit: 2,
  defaultServiceMin: 10,
  dailyLimit: 0,
};

export const NO_SHOW_RETENTION_DAYS = 60;

/** ألوان التطبيق الجاهزة (القيم في src/lib/theme.ts)، مرتّبة حسب درجة اللون. */
export const THEMES = [
  "emerald",
  "green",
  "teal",
  "cyan",
  "sky",
  "blue",
  "navy",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "red",
  "orange",
  "amber",
  "brown",
  "slate",
] as const;
export type PresetTheme = (typeof THEMES)[number];
/** «custom» = لون يختاره الطبيب بنفسه (look.custom). */
export type ThemeKey = PresetTheme | "custom";

/** تصاميم شاشة القاعة — تخطيطات مختلفة كلّياً (src/app/d/[slug]/layouts). */
export const DISPLAY_STYLES = ["night", "light", "color", "focus", "board", "led", "elegant", "kids", "portrait"] as const;
export type DisplayStyle = (typeof DISPLAY_STYLES)[number];

export interface ShopLook {
  theme: ThemeKey;
  /** لون الطبيب الخاصّ (#rrggbb) — مستعمل حين theme = "custom" */
  custom: string | null;
  display: DisplayStyle;
}

export const DEFAULT_LOOK: ShopLook = { theme: "emerald", custom: null, display: "night" };

export function isTheme(v: unknown): v is ThemeKey {
  return v === "custom" || (THEMES as readonly unknown[]).includes(v);
}

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

export function isDisplayStyle(v: unknown): v is DisplayStyle {
  return (DISPLAY_STYLES as readonly unknown[]).includes(v);
}

/** يقرأ المظهر المخزَّن مع قيم افتراضية لكلّ ما هو مفقود أو غير صالح. */
export function readLook(v: unknown): ShopLook {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const custom = isHexColor(o.custom) ? o.custom.toLowerCase() : null;
  let theme = isTheme(o.theme) ? o.theme : DEFAULT_LOOK.theme;
  if (theme === "custom" && !custom) theme = DEFAULT_LOOK.theme;
  return { theme, custom, display: isDisplayStyle(o.display) ? o.display : DEFAULT_LOOK.display };
}

export type ShopKind = "doctor" | "dentist" | "lab" | "barber" | "other";

export interface Shop {
  id: string;
  slug: string;
  name: string;
  kind: ShopKind;
  pinHash: string;
  doorCode: string;
  hours: WeeklyHours;
  settings: ShopSettings;
  defaultLang: Lang;
  trialEndsAt: Date;
  paidUntil: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  sessionVersion: number;
  createdAt: Date;
  /** ملفّ العيادة الظاهر للمرضى (اختياري) */
  profile: ShopProfile;
  /** لون التطبيق وتصميم شاشة القاعة */
  look: ShopLook;
  /** بريد صاحب العيادة: لاستعادة الرمز السرّي */
  ownerEmail: string | null;
  /** أدوار + عيادات متعدّدة الأطبّاء (010_clinics_roles) */
  assistantPinHash?: string | null;
  assistantVersion?: number;
  clinicId?: string | null;
  room?: string | null;
  /**
   * اشتراك العيادة التي ينتمي إليها الطابور (014_clinic_billing) — يُحمَّل بـ LEFT JOIN في repo:
   * paid_until للعيادة، وتجربتها فقط إن أُنشئ الطابور بعد العيادة (repo.clinicCoverSql). انظر src/lib/domain/subscription.ts.
   */
  clinicUntil?: Date | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  /** أيّام العطل: لا أرقام ولا مواعيد (020_days_off) — src/lib/domain/daysoff.ts */
  daysOff: DayOff[];
}

export interface DayOff {
  /** "YYYY-MM-DD" بتوقيت الجزائر */
  day: string;
  /** اسم يختاره الطبيب (عيد الفطر، إجازة…) */
  label: string | null;
}

export interface ShopProfile {
  doctorName: string | null;
  specialty: string | null;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  /** رمز الولاية 1–58 (src/lib/domain/wilayas.ts) — لدليل العيادات */
  wilaya: number | null;
}

export type NotifyType = "confirm" | "soon" | "called" | "missed" | "held" | "approved";

export type Action =
  | { kind: "update"; id: string; expect: TicketStatus[]; patch: TicketPatch }
  | { kind: "notify"; id: string; type: NotifyType }
  | { kind: "noShow"; id: string };

export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
