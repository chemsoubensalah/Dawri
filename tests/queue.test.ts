import { describe, expect, it } from "vitest";
import {
  averageServiceMinutes,
  currentTicket,
  estimateWaitMinutes,
  initialFlags,
  lineup,
  peopleAhead,
  planCheckIn,
  planCloseStale,
  planNext,
  planTick,
  project,
} from "@/lib/domain/queue";
import { DEFAULT_SETTINGS, type Action, type Ticket } from "@/lib/domain/types";
import { normalizePhone, maskPhone } from "@/lib/domain/phone";
import { dayKey, isValidHours, isWithinHours } from "@/lib/domain/time";

const T0 = new Date("2026-10-11T07:00:00Z"); // 08:00 بتوقيت الجزائر، الأحد
const min = (m: number) => new Date(T0.getTime() + m * 60000);
const S = DEFAULT_SETTINGS;

function mk(number: number, over: Partial<Ticket> = {}): Ticket {
  return {
    id: `t${number}`,
    shopId: "s",
    day: "2026-10-11",
    number,
    name: `P${number}`,
    phone: `+21355000000${number}`,
    lang: "ar",
    source: "online",
    status: "waiting",
    held: false,
    createdAt: T0,
    calledAt: null,
    doneAt: null,
    deferredAt: null,
    arrivedAt: null,
    confirmAskedAt: null,
    confirmedAt: null,
    notifiedSoonAt: null,
    closedAt: null,
    waCode: null,
    waUserId: null,
    waPhone: null,
    waWindowUntil: null,
    waOptOut: false,
    ...over,
  };
}

const updates = (a: Action[]) => a.filter((x) => x.kind === "update");
const notifies = (a: Action[]) => a.filter((x) => x.kind === "notify").map((x) => `${x.id}:${(x as { type: string }).type}`);

describe("الهاتف والوقت", () => {
  it("يوحّد أرقام النقّال الجزائرية", () => {
    expect(normalizePhone("0550123456")).toBe("+213550123456");
    expect(normalizePhone("0550 12 34 56")).toBe("+213550123456");
    expect(normalizePhone("+213 550-12-34-56")).toBe("+213550123456");
    expect(normalizePhone("00213661234567")).toBe("+213661234567");
    expect(normalizePhone("+2130771234567")).toBe("+213771234567");
    expect(normalizePhone("021123456")).toBeNull(); // ثابت
    expect(normalizePhone("0850123456")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(maskPhone("+213550123456")).toBe("0550 •• •• 56");
  });

  it("يحسب اليوم والساعات بتوقيت الجزائر", () => {
    expect(dayKey(new Date("2026-10-11T23:30:00Z"))).toBe("2026-10-12"); // 00:30 محلّياً
    const hours = { "0": [["06:00", "16:00"]] as [string, string][] };
    expect(isWithinHours(hours, new Date("2026-10-11T05:00:00Z"))).toBe(true); // 06:00
    expect(isWithinHours(hours, new Date("2026-10-11T04:59:00Z"))).toBe(false);
    expect(isWithinHours(hours, new Date("2026-10-11T15:00:00Z"))).toBe(false); // 16:00
    expect(isWithinHours(hours, new Date("2026-10-12T07:00:00Z"))).toBe(false); // الإثنين
    expect(isValidHours({ "0": [["08:00", "07:00"]] })).toBe(false);
    expect(isValidHours({ "7": [] })).toBe(false);
    expect(isValidHours({ "5": [], "6": [["06:00", "12:00"], ["14:00", "18:00"]] })).toBe(true);
  });
});

describe("حساب الطابور", () => {
  it("يعدّ من أمامه بمن فيهم الحالي، ويتجاهل المؤجَّلين", () => {
    const ts = [
      mk(1, { status: "called", calledAt: T0 }),
      mk(2),
      mk(3, { held: true }),
      mk(4, { status: "pending_approval" }),
      mk(5),
    ];
    expect(peopleAhead(ts, ts[4])).toBe(2); // الحالي + رقم 2
    expect(peopleAhead(ts, ts[1])).toBe(1);
    expect(peopleAhead(ts, ts[0])).toBeNull();
    expect(lineup(ts).map((t) => t.number)).toEqual([2, 3, 5]);
  });

  it("متوسّط المدّة يمزج بالافتراضي مع قلّة البيانات", () => {
    const d = (n: number, m: number) => mk(n, { status: "done", calledAt: min(0), doneAt: min(m) });
    expect(averageServiceMinutes([], 10)).toBe(10);
    expect(averageServiceMinutes([d(1, 4)], 10)).toBeCloseTo(8); // (4+10+10)/3
    expect(averageServiceMinutes([d(1, 4), d(2, 6), d(3, 5), d(4, 5)], 10)).toBe(5);
    // القيم الشاذّة تُهمَل
    expect(averageServiceMinutes([d(1, 0.1), d(2, 500)], 10)).toBe(10);
  });

  it("يقدّر الوقت المتبقّي مع احتساب ما مضى من مدّة الحالي", () => {
    const ts = [mk(1, { status: "called", calledAt: min(0) }), mk(2), mk(3)];
    // متوسّط 10: الحالي بقي له 7، ثمّ رقم 2 (10) ← 17
    expect(estimateWaitMinutes(ts, ts[2], min(3), S)).toBe(17);
    // تجاوز الحالي المتوسّط: نحسب دقيقة واحدة على الأقلّ
    expect(estimateWaitMinutes(ts, ts[1], min(30), S)).toBe(1);
  });
});

describe("زرّ التالي", () => {
  it("ينهي الحالي وينادي التالي", () => {
    const ts = [mk(1, { status: "called", calledAt: min(0) }), mk(2), mk(3)];
    const a = planNext(ts, min(8), "done");
    const p = project(ts, a);
    expect(p.find((t) => t.number === 1)!.status).toBe("done");
    expect(currentTicket(p)!.number).toBe(2);
    expect(notifies(a)).toEqual(["t2:called"]);
  });

  it("«لم يحضر» يؤجّل الحالي ولا يوقف الطابور", () => {
    const ts = [mk(1, { status: "called", calledAt: min(0) }), mk(2)];
    const p = project(ts, planNext(ts, min(2), "no_show"));
    expect(p[0].status).toBe("deferred");
    expect(p[0].deferredAt).toEqual(min(2));
    expect(currentTicket(p)!.number).toBe(2);
  });

  it("يتخطّى المؤجَّلين لعدم الردّ ومن ينتظر الموافقة", () => {
    const ts = [mk(1, { held: true }), mk(2, { status: "pending_approval" }), mk(3)];
    expect(currentTicket(project(ts, planNext(ts, T0, "done")))!.number).toBe(3);
  });

  it("الطابور الفارغ: لا شيء", () => {
    expect(planNext([], T0, "done")).toEqual([]);
  });
});

describe("قواعد الغياب (planTick)", () => {
  it("1) يسأل «هل ما زلت قادماً؟» حين يبقى 5، ويؤجّل بلا ردّ بعد 10 دقائق", () => {
    const ts = [
      mk(1, { status: "called", calledAt: T0, arrivedAt: T0 }),
      ...[2, 3, 4, 5].map((n) => mk(n, { arrivedAt: T0 })), // في القاعة
      mk(6),
      mk(7),
    ];
    let a = planTick(ts, T0, S);
    // أمام رقم 6: الحالي + 2..5 = 5
    expect(notifies(a)).toContain("t6:confirm");
    expect(notifies(a)).not.toContain("t7:confirm");
    let state = project(ts, a);
    expect(state.find((t) => t.number === 6)!.confirmAskedAt).toEqual(T0);

    // بعد 9 دقائق: لا شيء جديد
    expect(updates(planTick(state, min(9), S)).filter((x) => x.id === "t6")).toHaveLength(0);
    // بعد 10 دقائق: يُؤجَّل
    a = planTick(state, min(10), S);
    state = project(state, a);
    expect(state.find((t) => t.number === 6)!.held).toBe(true);
    expect(notifies(a)).toContain("t6:held");
    // رقم 7 صار أمامه 5 الآن (لأنّ 6 خرج من العدّ) ← يُسأل هو
    expect(notifies(a)).toContain("t7:confirm");
  });

  it("من أكّد لا يُؤجَّل، ومن وصل لا يُسأل", () => {
    const ts = [
      mk(1, { confirmAskedAt: T0, confirmedAt: min(1) }),
      mk(2, { arrivedAt: T0 }),
    ];
    const a = planTick(ts, min(30), S);
    expect(updates(a).filter((x) => (x as { patch: { held?: boolean } }).patch.held)).toHaveLength(0);
    expect(notifies(a)).not.toContain("t2:confirm");
  });

  it("«تعال الآن» حين يبقى 3، مرّة واحدة فقط", () => {
    const ts = [mk(1, { status: "called", calledAt: T0, arrivedAt: T0 }), mk(2), mk(3), mk(4), mk(5)];
    const a = planTick(ts, T0, S);
    expect(notifies(a)).toContain("t4:soon"); // أمامه 3
    expect(notifies(a)).not.toContain("t5:soon");
    const again = planTick(project(ts, a), min(1), S);
    expect(notifies(again).filter((n) => n.endsWith(":soon"))).toHaveLength(0);
  });

  it("3) التخطّي التلقائي: نودي ولم يصل خلال المهلة ← مؤجَّل والتالي يُنادى", () => {
    const ts = [mk(1, { status: "called", calledAt: T0 }), mk(2, { arrivedAt: T0 })];
    expect(planTick(ts, min(4), S).filter((x) => x.id === "t1")).toHaveLength(0);
    const a = planTick(ts, min(5), S);
    const p = project(ts, a);
    expect(p[0].status).toBe("deferred");
    expect(currentTicket(p)!.number).toBe(2);
    expect(notifies(a)).toEqual(expect.arrayContaining(["t1:missed", "t2:called"]));
  });

  it("لا تخطّي تلقائي لمن سجّل وصوله، ولا لمن أضافته السكرتيرة، ولا حين يكون معطّلاً", () => {
    const arrived = [mk(1, { status: "called", calledAt: T0, arrivedAt: T0 }), mk(2)];
    expect(planTick(arrived, min(60), S).filter((x) => x.id === "t1")).toHaveLength(0);
    const desk = [mk(1, { status: "called", calledAt: T0, source: "desk", phone: null }), mk(2)];
    expect(planTick(desk, min(60), S).filter((x) => x.id === "t1")).toHaveLength(0);
    const off = [mk(1, { status: "called", calledAt: T0 }), mk(2)];
    expect(planTick(off, min(60), { ...S, callGraceMin: 0 }).filter((x) => x.id === "t1")).toHaveLength(0);
  });

  it("المؤجَّل: يعود خلال 15 دقيقة فيدخل بعد الحالي، وبعدها ينتهي ويُسجَّل غياباً", () => {
    const ts = [
      mk(1, { status: "deferred", deferredAt: T0 }),
      mk(2, { status: "called", calledAt: T0, arrivedAt: T0 }),
      mk(3, { arrivedAt: T0 }),
      mk(4, { arrivedAt: T0 }),
    ];
    // يعود بعد 10 دقائق
    const back = project(ts, planCheckIn(ts[0], min(10), S));
    expect(back[0].status).toBe("waiting");
    expect(lineup(back)[0].number).toBe(1); // قبل 3 و 4
    expect(peopleAhead(back, back[0])).toBe(1); // الحالي فقط
    // لا يعود: بعد 15 دقيقة ينتهي
    const a = planTick(ts, min(15), S);
    expect(project(ts, a)[0].status).toBe("no_show");
    expect(a).toContainEqual({ kind: "noShow", id: "t1" });
    expect(() => planCheckIn(ts[0], min(15), S)).toThrow("too_late");
  });

  it("المؤجَّل لعدم الردّ يستعيد مكانه حين يؤكّد", () => {
    const ts = [mk(1, { status: "called", calledAt: T0, arrivedAt: T0 }), mk(2, { held: true }), mk(3)];
    const back = project(ts, planCheckIn(ts[1], min(1), S));
    expect(back[1].held).toBe(false);
    expect(peopleAhead(back, back[2])).toBe(2);
  });
});

describe("تذكرة جديدة", () => {
  it("القريب من دوره والطابور يتحرّك: لا يُسأل ولا يحتاج «تعال الآن»", () => {
    const f = initialFlags([mk(1, { status: "called", calledAt: T0 }), mk(2)], S, T0, { arrived: false, source: "online" });
    expect(f.confirmedAt).toEqual(T0);
    expect(f.notifiedSoonAt).toEqual(T0);
  });
  it("قبل أن يبدأ الطبيب: يُنبَّه لاحقاً حين يتحرّك الطابور", () => {
    const f = initialFlags([mk(1)], S, T0, { arrived: false, source: "online" });
    expect(f.confirmedAt).toBeUndefined();
    expect(f.notifiedSoonAt).toBeUndefined();
    const ts = [mk(1), mk(2), mk(3)];
    expect(notifies(planTick(ts, T0, S))).toEqual([]); // لم يبدأ أحد
    const started = project(ts, planNext(ts, T0, "done"));
    expect(notifies(planTick(started, T0, S))).toEqual(["t2:soon", "t3:soon"]);
  });

  it("البعيد يُسأل لاحقاً", () => {
    const many = Array.from({ length: 10 }, (_, i) => mk(i + 1));
    const f = initialFlags(many, S, T0, { arrived: false, source: "online" });
    expect(f.confirmedAt).toBeUndefined();
    expect(f.notifiedSoonAt).toBeUndefined();
  });
});

describe("نهاية اليوم", () => {
  it("المؤجَّل ومن لم يردّ = غياب، ومن لم يصل دوره = انتهى بلا عقوبة", () => {
    const stale = [
      mk(1, { status: "deferred", deferredAt: T0 }),
      mk(2, { held: true }),
      mk(3),
      mk(4, { status: "called", calledAt: T0 }),
      mk(5, { status: "pending_approval" }),
    ];
    const a = planCloseStale(stale, min(600));
    const p = project(stale, a);
    expect(p.map((t) => t.status)).toEqual(["no_show", "no_show", "expired", "done", "expired"]);
    expect(a.filter((x) => x.kind === "noShow").map((x) => x.id)).toEqual(["t1", "t2"]);
  });
});
