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
}

export const DEFAULT_SETTINGS: ShopSettings = {
  confirmAhead: 5,
  confirmTimeoutMin: 10,
  notifyAhead: 3,
  callGraceMin: 5,
  lateWindowMin: 15,
  noShowLimit: 2,
  defaultServiceMin: 10,
};

export const NO_SHOW_RETENTION_DAYS = 60;

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
}

export interface ShopProfile {
  doctorName: string | null;
  specialty: string | null;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
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
