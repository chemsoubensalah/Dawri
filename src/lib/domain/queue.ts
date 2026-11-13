/**
 * منطق الطابور — دوالّ صافية بلا قاعدة بيانات ولا شبكة.
 * كلّ دالّة plan* تُرجع قائمة «أفعال» (Action) يطبّقها الخادم داخل معاملة واحدة.
 *
 * القاعدة الذهبية: الغائب لا يوقف الطابور أبداً.
 */
import { minutesBetween } from "./time";
import {
  DomainError,
  type Action,
  type ShopSettings,
  type Ticket,
  type TicketPatch,
  type TicketStatus,
} from "./types";

export function byNumber(a: Ticket, b: Ticket) {
  return a.number - b.number;
}

/** الزبون الحالي (الذي نودي آخراً). */
export function currentTicket(tickets: Ticket[]): Ticket | null {
  let cur: Ticket | null = null;
  for (const t of tickets) {
    if (t.status !== "called") continue;
    if (!cur || (t.calledAt?.getTime() ?? 0) > (cur.calledAt?.getTime() ?? 0)) cur = t;
  }
  return cur;
}

/** هل يمكن مناداته الآن؟ (في الطابور وغير مؤجَّل) */
export function isEligible(t: Ticket): boolean {
  return t.status === "waiting" && !t.held;
}

/** متى صار ذا أولوية (وصول صاحب الموعد)؛ تذاكر قديمة بلا priorityAt ← createdAt. */
function priorityTime(t: Ticket): number {
  return (t.priorityAt ?? t.createdAt).getTime();
}

/**
 * ترتيب الطابور، ثلاث طبقات:
 *  0) صاحب موعد وصل ولم تحرّكه السكرتيرة: أوّلاً، بترتيب وصوله (priorityAt).
 *  1) من رتّبته السكرتيرة يدوياً (queuePos): بترتيبها، أيّاً كان نوعه (موعد أو رقم عادي).
 *  2) البقيّة (أرقام جديدة): بالرقم.
 * فصاحب الموعد الذي يصل بعد إعادة الترتيب يتقدّم، ويمكن للسكرتيرة نقل أيّ شخص قبل أيّ شخص.
 */
function tier(t: Ticket): number {
  if (t.queuePos != null) return 1;
  return t.priority ? 0 : 2;
}

export function queueOrder(a: Ticket, b: Ticket): number {
  const ta = tier(a);
  const tb = tier(b);
  if (ta !== tb) return ta - tb;
  if (ta === 0) {
    const d = priorityTime(a) - priorityTime(b);
    if (d) return d;
  } else if (ta === 1) {
    const d = (a.queuePos as number) - (b.queuePos as number);
    if (d) return d;
  }
  return byNumber(a, b);
}

/**
 * السكرتيرة تنقل منتظراً مكاناً واحداً (↑ dir=-1، ↓ dir=1): يتبادل مكانه مع جاره.
 * يُكتب مكان كلّ منتظر (queuePos = ترتيبه) كي يثبت الترتيب. بلا جار (أوّل/آخر الطابور) ← [].
 */
export function planMove(tickets: Ticket[], id: string, dir: -1 | 1): Action[] {
  const line = lineup(tickets);
  const i = line.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= line.length) return [];
  [line[i], line[j]] = [line[j], line[i]];
  const acts: Action[] = [];
  line.forEach((t, k) => {
    if (t.queuePos !== k) acts.push(update(t, ["waiting"], { queuePos: k }));
  });
  return acts;
}

/**
 * السحب والإفلات: السكرتيرة تضع منتظراً قبل منتظر آخر (beforeId)، أو آخر الطابور (null).
 * يُكتب مكان كلّ منتظر (queuePos = ترتيبه) كي يثبت الترتيب. null ← مكان غير صالح (الطابور تغيّر).
 */
export function planPlace(tickets: Ticket[], id: string, beforeId: string | null): Action[] | null {
  const line = lineup(tickets);
  const moving = line.find((t) => t.id === id);
  if (!moving || beforeId === id) return null;
  const rest = line.filter((t) => t.id !== id);
  const at = beforeId === null ? rest.length : rest.findIndex((t) => t.id === beforeId);
  if (at < 0) return null;
  rest.splice(at, 0, moving);
  const acts: Action[] = [];
  rest.forEach((t, k) => {
    if (t.queuePos !== k) acts.push(update(t, ["waiting"], { queuePos: k }));
  });
  return acts;
}

/** الحالات التي يمكن إعادتها إلى الطابور (مرّ عليها المريض بالخطأ) */
export const RESTORABLE: TicketStatus[] = ["called", "done", "no_show", "cancelled", "deferred"];

/**
 * «أعده إلى الطابور»: من نودي أو انتهى أو غاب أو أُلغي أو أُجِّل يعود أوّل المنتظرين.
 * (حذف سجلّ الغياب إن كان غائباً يتمّ في الخدمة.)
 */
export function planRestore(tickets: Ticket[], ticket: Ticket): Action[] {
  const queued = tickets.filter((t) => t.status === "waiting" && t.queuePos != null).map((t) => t.queuePos as number);
  const front = queued.length ? Math.min(...queued) - 1 : -1;
  return [
    update(ticket, [ticket.status], {
      status: "waiting",
      held: false,
      calledAt: null,
      doneAt: null,
      deferredAt: null,
      closedAt: null,
      queuePos: front,
    }),
  ];
}

/** «أنهِ دون نداء التالي»: الحالي يخرج وتبقى غرفة الطبيب فارغة. */
export function planFinish(tickets: Ticket[], now: Date): Action[] {
  const cur = currentTicket(tickets);
  return cur ? [update(cur, ["called"], { status: "done", doneAt: now, closedAt: now })] : [];
}

/** الطابور مرتّباً (queueOrder). المؤجَّل الذي عاد يحتفظ برقمه الصغير فيدخل بعد الحالي مباشرة. */
export function lineup(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === "waiting").sort(queueOrder);
}

export function nextEligible(tickets: Ticket[]): Ticket | null {
  return lineup(tickets).find(isEligible) ?? null;
}

/** عدد الأشخاص أمامه (بمن فيهم الزبون الذي في الداخل الآن). */
export function peopleAhead(tickets: Ticket[], ticket: Ticket): number | null {
  if (ticket.status !== "waiting") return null;
  let n = currentTicket(tickets) ? 1 : 0;
  for (const t of tickets) {
    if (t.id !== ticket.id && isEligible(t) && queueOrder(t, ticket) < 0) n++;
  }
  return n;
}

/**
 * متوسّط مدّة الزبون اليوم بالدقائق.
 * مع أقلّ من 3 قياسات نمزج بالقيمة الافتراضية كي لا يقفز التقدير.
 */
export function averageServiceMinutes(tickets: Ticket[], defaultMin: number): number {
  const durations: number[] = [];
  for (const t of tickets) {
    if (t.status !== "done" || !t.calledAt || !t.doneAt) continue;
    const d = minutesBetween(t.calledAt, t.doneAt);
    if (d >= 0.5 && d <= 180) durations.push(d);
  }
  const n = durations.length;
  const sum = durations.reduce((a, b) => a + b, 0);
  const k = Math.max(0, 3 - n);
  return (sum + defaultMin * k) / (n + k);
}

/** الوقت المتوقَّع بالدقائق حتى دوره. */
export function estimateWaitMinutes(
  tickets: Ticket[],
  ticket: Ticket,
  now: Date,
  settings: ShopSettings,
): number | null {
  const ahead = peopleAhead(tickets, ticket);
  if (ahead === null) return null;
  const avg = averageServiceMinutes(tickets, settings.defaultServiceMin);
  const cur = currentTicket(tickets);
  if (cur?.calledAt) {
    const remaining = Math.max(avg - minutesBetween(cur.calledAt, now), 1);
    return Math.ceil(remaining + (ahead - 1) * avg);
  }
  return Math.ceil(ahead * avg);
}

// ————————————————————————————— الأفعال —————————————————————————————

function update(t: Ticket, expect: TicketStatus[], patch: TicketPatch): Action {
  return { kind: "update", id: t.id, expect, patch };
}

/** يطبّق الأفعال على نسخة من القائمة (لنحسب ما بعدها). */
export function project(tickets: Ticket[], actions: Action[]): Ticket[] {
  const map = new Map(tickets.map((t) => [t.id, { ...t }]));
  for (const a of actions) {
    if (a.kind !== "update") continue;
    const t = map.get(a.id);
    if (t) Object.assign(t, a.patch);
  }
  return [...map.values()];
}

export type NextMode = "done" | "no_show";

/**
 * زرّ «التالي» (mode=done) أو «لم يحضر — التالي» (mode=no_show).
 * الحالي ← انتهى/مؤجَّل، ثمّ يُنادى أوّل من يحقّ له.
 */
export function planNext(tickets: Ticket[], now: Date, mode: NextMode): Action[] {
  const actions: Action[] = [];
  const cur = currentTicket(tickets);
  if (cur) {
    if (mode === "done") {
      actions.push(update(cur, ["called"], { status: "done", doneAt: now, closedAt: now }));
    } else {
      actions.push(update(cur, ["called"], { status: "deferred", deferredAt: now }));
      actions.push({ kind: "notify", id: cur.id, type: "missed" });
    }
  }
  actions.push(...planCallNext(project(tickets, actions), now));
  return actions;
}

/**
 * «نادِ الآن»: السكرتيرة تنادي رقماً بعينه قبل دوره (صاحب الدور لم يصل بعد مثلاً).
 * الحالي يُنهى (تمّ) كما في «التالي»؛ من تُخطّي يبقى في مكانه أوّل الطابور — 17 ثمّ 16 ثمّ 18.
 */
export function planCallTicket(tickets: Ticket[], now: Date, ticket: Ticket): Action[] {
  const actions: Action[] = [];
  const cur = currentTicket(tickets);
  if (cur) actions.push(update(cur, ["called"], { status: "done", doneAt: now, closedAt: now }));
  actions.push(update(ticket, ["waiting"], { status: "called", calledAt: now, held: false }), { kind: "notify", id: ticket.id, type: "called" });
  return actions;
}

function planCallNext(tickets: Ticket[], now: Date): Action[] {
  const nxt = nextEligible(tickets);
  if (!nxt) return [];
  return [
    update(nxt, ["waiting"], { status: "called", calledAt: now }),
    { kind: "notify", id: nxt.id, type: "called" },
  ];
}

/**
 * ما يجب أن يحدث مع مرور الوقت. يُستدعى بعد كلّ عملية وعند كلّ تحديث للصفحات.
 * 1) المؤجَّل الذي تجاوز المهلة ← غائب.
 * 2) لم يردّ على سؤال التأكيد خلال المهلة ← يُؤجَّل دوره.
 * 3) نودي ولم يؤكّد وصوله ← يُتخطّى، ويُنادى التالي.
 * 4) العتبات: سؤال التأكيد (5 أمامه) و«تعال الآن» (3 أمامه).
 */
export function planTick(tickets: Ticket[], now: Date, s: ShopSettings): Action[] {
  const actions: Action[] = [];
  let state = tickets;
  const add = (acts: Action[]) => {
    actions.push(...acts);
    state = project(state, acts);
  };

  // 1) انتهاء مهلة المؤجَّل
  for (const t of state) {
    if (t.status === "deferred" && t.deferredAt && minutesBetween(t.deferredAt, now) >= s.lateWindowMin) {
      add([update(t, ["deferred"], { status: "no_show", closedAt: now }), { kind: "noShow", id: t.id }]);
    }
  }

  // 2) لا ردّ على سؤال التأكيد
  for (const t of state) {
    if (
      t.status === "waiting" &&
      !t.held &&
      t.confirmAskedAt &&
      !t.confirmedAt &&
      !t.arrivedAt &&
      minutesBetween(t.confirmAskedAt, now) >= s.confirmTimeoutMin
    ) {
      add([update(t, ["waiting"], { held: true }), { kind: "notify", id: t.id, type: "held" }]);
    }
  }

  // 3) التخطّي التلقائي لمن نودي ولم يحضر
  const cur = currentTicket(state);
  if (
    cur &&
    s.callGraceMin > 0 &&
    cur.source === "online" &&
    !cur.arrivedAt &&
    cur.calledAt &&
    minutesBetween(cur.calledAt, now) >= s.callGraceMin
  ) {
    add(planNext(state, now, "no_show"));
  }

  // 4) العتبات
  add(planThresholds(state, now, s));
  return actions;
}

/** هل بدأ العمل اليوم؟ (نودي أحد على الأقلّ) */
export function queueStarted(tickets: Ticket[]): boolean {
  return tickets.some((t) => t.calledAt);
}

function planThresholds(tickets: Ticket[], now: Date, s: ShopSettings): Action[] {
  const actions: Action[] = [];
  // قبل أن يبدأ الطبيب لا معنى لـ«تعال الآن»: من أخذ رقمه على السادسة يُنبَّه حين يتحرّك الطابور.
  if (!queueStarted(tickets)) return actions;
  for (const t of tickets) {
    if (!isEligible(t) || t.arrivedAt) continue;
    const ahead = peopleAhead(tickets, t)!;
    const patch: TicketPatch = {};
    let notify: "confirm" | "soon" | null = null;
    if (t.source === "online" && ahead <= s.confirmAhead && !t.confirmAskedAt && !t.confirmedAt) {
      patch.confirmAskedAt = now;
      notify = "confirm";
    }
    if (ahead <= s.notifyAhead && !t.notifiedSoonAt) {
      patch.notifiedSoonAt = now;
      notify = "soon"; // «تعال الآن» أهمّ؛ سؤال التأكيد يظهر في الصفحة على أيّ حال
    }
    if (notify) {
      actions.push(update(t, ["waiting"], patch), { kind: "notify", id: t.id, type: notify });
    }
  }
  return actions;
}

/** الحقول الأوّلية لتذكرة جديدة حسب موقعها لحظة إنشائها. */
export function initialFlags(
  tickets: Ticket[],
  s: ShopSettings,
  now: Date,
  opts: { arrived: boolean; source: "online" | "desk"; priority?: boolean },
): TicketPatch {
  const cur = currentTicket(tickets);
  // صاحب الموعد لا يتقدّمه إلّا أصحاب المواعيد الذين وصلوا قبله
  const ahead = (cur ? 1 : 0) + tickets.filter((t) => isEligible(t) && (!opts.priority || t.priority)).length;
  const started = queueStarted(tickets);
  const patch: TicketPatch = {};
  if (opts.arrived) patch.arrivedAt = now;
  // من يأخذ رقماً والطابور يتحرّك وهو قريب أصلاً، أو أضافته السكرتيرة، لا نسأله «هل ما زلت قادماً؟»
  if (opts.source === "desk" || opts.arrived || (started && ahead <= s.confirmAhead)) patch.confirmedAt = now;
  if (opts.arrived || (started && ahead <= s.notifyAhead)) patch.notifiedSoonAt = now;
  return patch;
}

/** زرّ «وصلت» (من رمز الباب) أو «حاضر» من السكرتيرة. */
export function planCheckIn(ticket: Ticket, now: Date, s: ShopSettings): Action[] {
  switch (ticket.status) {
    case "pending_approval":
      return [update(ticket, ["pending_approval"], { arrivedAt: ticket.arrivedAt ?? now })];
    case "waiting":
      return [
        update(ticket, ["waiting"], {
          arrivedAt: ticket.arrivedAt ?? now,
          held: false,
          confirmedAt: ticket.confirmedAt ?? now,
        }),
      ];
    case "called":
      return [update(ticket, ["called"], { arrivedAt: ticket.arrivedAt ?? now })];
    case "deferred":
      if (ticket.deferredAt && minutesBetween(ticket.deferredAt, now) >= s.lateWindowMin) {
        throw new DomainError("too_late", 409);
      }
      // يعود إلى الطابور برقمه الأصليّ ← يدخل بعد الزبون الحالي مباشرة
      return [
        update(ticket, ["deferred"], {
          status: "waiting",
          arrivedAt: now,
          held: false,
          confirmedAt: now,
        }),
      ];
    case "no_show":
      throw new DomainError("too_late", 409);
    default:
      throw new DomainError("ticket_closed", 409);
  }
}

/** «نعم، ما زلت قادماً». */
export function planConfirm(ticket: Ticket, now: Date): Action[] {
  if (ticket.status !== "waiting") throw new DomainError("ticket_closed", 409);
  return [update(ticket, ["waiting"], { confirmedAt: now, held: false })];
}

export function planCancel(ticket: Ticket, now: Date): Action[] {
  const open: TicketStatus[] = ["pending_approval", "waiting", "called", "deferred"];
  if (!open.includes(ticket.status)) throw new DomainError("ticket_closed", 409);
  const actions: Action[] = [update(ticket, open, { status: "cancelled", closedAt: now })];
  return actions;
}

export function planApprove(ticket: Ticket): Action[] {
  if (ticket.status !== "pending_approval") throw new DomainError("ticket_closed", 409);
  return [
    update(ticket, ["pending_approval"], { status: "waiting" }),
    { kind: "notify", id: ticket.id, type: "approved" },
  ];
}

export function planReject(ticket: Ticket, now: Date): Action[] {
  if (ticket.status !== "pending_approval") throw new DomainError("ticket_closed", 409);
  return [update(ticket, ["pending_approval"], { status: "rejected", closedAt: now })];
}

/**
 * تذاكر أيّام سابقة بقيت مفتوحة (أُغلق اليوم).
 * المؤجَّل ومن لم يردّ على التأكيد = غياب. من لم يصل دوره = انتهى بلا عقوبة.
 */
export function planCloseStale(stale: Ticket[], now: Date): Action[] {
  const actions: Action[] = [];
  for (const t of stale) {
    if (t.status === "deferred" || (t.status === "waiting" && t.held)) {
      actions.push(update(t, [t.status], { status: "no_show", closedAt: now }), { kind: "noShow", id: t.id });
    } else if (t.status === "called") {
      actions.push(update(t, ["called"], { status: "done", closedAt: now }));
    } else if (t.status === "waiting" || t.status === "pending_approval") {
      actions.push(update(t, [t.status], { status: "expired", closedAt: now }));
    }
  }
  return actions;
}

export interface DayStats {
  total: number;
  served: number;
  noShows: number;
  cancelled: number;
  waiting: number;
  avgServiceMin: number | null;
  avgWaitMin: number | null;
}

export function dayStats(tickets: Ticket[]): DayStats {
  const served = tickets.filter((t) => t.status === "done");
  const waits = tickets
    .filter((t) => t.calledAt && (t.status === "done" || t.status === "called"))
    .map((t) => minutesBetween(t.createdAt, t.calledAt!));
  const durations = served
    .filter((t) => t.calledAt && t.doneAt)
    .map((t) => minutesBetween(t.calledAt!, t.doneAt!));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    total: tickets.length,
    served: served.length,
    noShows: tickets.filter((t) => t.status === "no_show").length,
    cancelled: tickets.filter((t) => t.status === "cancelled").length,
    waiting: tickets.filter((t) => t.status === "waiting").length,
    avgServiceMin: avg(durations),
    avgWaitMin: avg(waits),
  };
}
