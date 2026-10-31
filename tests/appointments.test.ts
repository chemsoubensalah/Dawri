/**
 * المواعيد: الحجز، السعة تحت التزامن، الوصول ← تذكرة ذات أولوية، الغياب، والتجهيل.
 * نفس SQL الإنتاج (PGlite، أو Postgres حقيقي عبر TEST_DATABASE_URL في مخطّط مستقلّ).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { setNotifier } from "@/lib/server/notify";
import * as svc from "@/lib/server/service";
import * as ap from "@/lib/server/appointments";
import * as repo from "@/lib/server/repo";
import * as gate from "@/lib/server/smsgate";
import { sentSms } from "@/lib/server/sms";
import { claimRate, clientIp, ipBucket, IP_LIMITS, rateCount } from "@/lib/server/ratelimit";
import { estimateWaitMinutes, initialFlags, lineup, nextEligible, peopleAhead, planNext } from "@/lib/domain/queue";
import { addDays, availability, checkinWindow, daySlots, DEFAULT_BOOKING, slotInstant } from "@/lib/domain/appointments";
import { cleanDaysOff, dayRange, upcomingFixedHolidays } from "@/lib/domain/daysoff";
import { activeReasonConfig, cleanReason, cleanReasonConfig, defaultReasonConfig, readReasonConfig, reasonCap } from "@/lib/domain/reasons";
import { cleanLimits, DEFAULT_LIMITS, phoneWaitUntil, readLimits } from "@/lib/domain/limits";
import { limitsSettingsView, saveLimitsSettings } from "@/lib/server/limits";
import { cleanPrintConfig, DEFAULT_PRINT, defaultLayout, readPrintConfig } from "@/lib/domain/printing";
import { printSettingsView, savePrintSettings } from "@/lib/server/print-settings";
import { saveReasonSettings } from "@/lib/server/reason-settings";
import * as apr from "@/lib/server/appointments-repo";
import { errorText, reasonText } from "@/lib/i18n";
import { daysOffView, saveDaysOff } from "@/lib/server/daysoff";
import { buildIcs, foldLine } from "@/lib/ics";
import { DEFAULT_SETTINGS, DomainError, type Shop, type Ticket } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z"); // الأحد 08:00 بتوقيت الجزائر
const at = (day: string, hhmm: string) => (clock = new Date(`${day}T${hhmm}:00+01:00`));
const advance = (m: number) => (clock = new Date(clock.getTime() + m * 60000));
const SCHEMA = "appt_tests";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    // مخطّط خاصّ بهذا الملفّ: لا يتصادم مع service.test.ts الذي يعيد إنشاء public بالتوازي
    const u = new URL(url);
    u.searchParams.set("options", `-c search_path=${SCHEMA}`);
    db = await createPgDb(u.toString());
    await db.exec(`drop schema if exists ${SCHEMA} cascade; create schema ${SCHEMA};`);
  } else {
    db = await createPgliteDb();
  }
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setNotifier({ send: async () => {} });
});

afterAll(async () => {
  setDb(undefined);
  setClock(undefined);
  setNotifier(undefined);
  if (process.env.TEST_DATABASE_URL) await db.exec(`drop schema if exists ${SCHEMA} cascade`);
  await db.close();
});

let shop: Shop;
let n = 0;
let phoneSeq = 10;
const newPhone = () => `0660${String(phoneSeq++).padStart(6, "0")}`;

beforeEach(async () => {
  clock = new Date("2026-10-11T07:00:00Z");
  shop = await svc.createShop({ name: "عيادة المواعيد", slug: `rdv-${++n}`, kind: "doctor", pin: "4321", email: "dr@example.com" });
});

afterEach(() => {
  delete process.env.PHONE_VERIFICATION;
  delete process.env.SMS_PROVIDER;
});

const fresh = async () => (await repo.getShopBySlug(db, shop.slug))!;
const enable = (over: Record<string, unknown> = {}) => ap.saveBookingSettings(shop, { enabled: true, ...over });

async function book(day: string, time: string, phone = newPhone(), name = "مريض") {
  const c = await ap.requestBookingCode(shop.slug, { name, phone, day, time });
  return ap.bookOnline(shop.slug, { name, phone, day, time, code: c.devCode });
}

async function desk(body: Record<string, unknown>) {
  return ap.staffAppointmentAction(await fresh(), { action: "book", name: "حجز هاتفي", ...body });
}

async function staffState() {
  return svc.staffState(await fresh());
}

// ————————————————————————— الطابور: الأولوية —————————————————————————

const T0 = new Date("2026-10-11T07:00:00Z");
const min = (m: number) => new Date(T0.getTime() + m * 60000);
function mk(number: number, over: Partial<Ticket> = {}): Ticket {
  return {
    id: `t${number}`,
    shopId: "s",
    day: "2026-10-11",
    number,
    name: `P${number}`,
    phone: null,
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

describe("الطابور: أصحاب المواعيد أوّلاً", () => {
  const tickets = () => [
    mk(1, { status: "called", calledAt: min(0) }),
    mk(2),
    mk(3),
    mk(7, { priority: true, createdAt: min(20) }),
    mk(5, { priority: true, createdAt: min(10) }),
    mk(6, { priority: true, createdAt: min(5), held: true }),
    mk(4),
  ];

  it("الترتيب: الأولوية بترتيب الوصول، ثمّ البقيّة بالأرقام", () => {
    expect(lineup(tickets()).map((t) => t.number)).toEqual([6, 5, 7, 2, 3, 4]);
    // المؤجَّل (held) يُتخطّى حتى لو كان ذا أولوية
    expect(nextEligible(tickets())?.number).toBe(5);
  });

  it("من أمامه: صاحب الموعد لا يتقدّمه إلّا الحالي ومواعيد وصلت قبله", () => {
    const ts = tickets();
    const by = (num: number) => ts.find((t) => t.number === num)!;
    expect(peopleAhead(ts, by(5))).toBe(1); // الحالي فقط
    expect(peopleAhead(ts, by(7))).toBe(2); // الحالي + 5
    expect(peopleAhead(ts, by(2))).toBe(3); // الحالي + 5 + 7
    expect(peopleAhead(ts, by(4))).toBe(5);
    expect(estimateWaitMinutes(ts, by(7), min(0), DEFAULT_SETTINGS)).toBe(20);
  });

  it("بين أصحاب المواعيد: لحظة منح الأولوية (priorityAt) لا لحظة أخذ الرقم", () => {
    const ts = [
      mk(1, { priority: true, createdAt: min(0), priorityAt: min(40) }), // رقم عادي صباحاً، ثمّ وصل لموعده متأخّراً
      mk(2, { priority: true, createdAt: min(30), priorityAt: min(30) }),
      mk(3),
    ];
    expect(lineup(ts).map((t) => t.number)).toEqual([2, 1, 3]);
    expect(peopleAhead(ts, ts[0])).toBe(1);
    // تذاكر قديمة بلا priorityAt ← createdAt
    expect(lineup([mk(4, { priority: true, createdAt: min(50) }), mk(5, { priority: true, createdAt: min(45), priorityAt: null })]).map((t) => t.number)).toEqual([5, 4]);
  });

  it("«التالي» ينادي صاحب الموعد قبل الأرقام الأصغر", () => {
    const acts = planNext(tickets(), min(30), "done");
    const called = acts.find((a) => a.kind === "update" && a.patch.status === "called");
    expect(called && called.id).toBe("t5");
  });

  it("تذكرة موعد جديدة: لا يُحسب أمامها إلّا الحالي ومواعيد سابقة", () => {
    const ts = [mk(1, { status: "called", calledAt: min(0) }), ...Array.from({ length: 8 }, (_, i) => mk(i + 2))];
    const normal = initialFlags(ts, DEFAULT_SETTINGS, min(1), { arrived: false, source: "online" });
    const prio = initialFlags(ts, DEFAULT_SETTINGS, min(1), { arrived: false, source: "online", priority: true });
    expect(normal.notifiedSoonAt).toBeUndefined(); // 9 أمامه
    expect(prio.notifiedSoonAt).toEqual(min(1)); // أمامه الحالي فقط
  });
});

// ————————————————————————— الشبكة والنوافذ (دوالّ صافية) —————————————————————————

describe("شبكة الأوقات", () => {
  it("تُقسَّم الفترات بطول الموعد، والموعد لا يتجاوز الإغلاق", () => {
    const hours = { "0": [["08:00", "09:00"], ["14:00", "14:50"]] as [string, string][] };
    expect(daySlots(hours, "2026-10-11", 20)).toEqual(["08:00", "08:20", "08:40", "14:00", "14:20"]);
    expect(daySlots(hours, "2026-10-12", 20)).toEqual([]); // الإثنين: لا ساعات
  });

  it("الأيّام: المغلق، المكتمل، والوقت الأدنى قبل الحجز", () => {
    const now = new Date("2026-10-15T07:00:00Z"); // الخميس 08:00
    const days = availability({
      settings: { ...DEFAULT_BOOKING, enabled: true, daysAhead: 2, dailyMax: 1 },
      shopHours: { "4": [["08:00", "10:00"]], "6": [["08:00", "09:00"]] },
      now,
      counts: [{ day: "2026-10-17", time: "08:15", n: 1 }],
      mode: "online",
    });
    expect(days.map((d) => d.state)).toEqual(["open", "closed", "full"]);
    expect(days[0].slots[0].time).toBe("08:30"); // 08:00 + 30 دقيقة
    const desk = availability({ settings: { ...DEFAULT_BOOKING, daysAhead: 0 }, shopHours: { "4": [["08:00", "10:00"]] }, now, counts: [], mode: "desk" });
    expect(desk[0].slots[0].time).toBe("08:00");
  });

  it("المهلة الدنيا بالوقت المطلق في كلّ يوم (لا اليوم فقط)", () => {
    // السبت 23:50 بتوقيت الجزائر، مهلة 30 دقيقة: مواعيد بعد منتصف الليل قبل 00:20 مستثناة
    const now = new Date("2026-10-10T22:50:00Z");
    const shopHours = { "0": [["00:00", "01:00"]] as [string, string][], "6": [["08:00", "09:00"]] as [string, string][] };
    const days = availability({ settings: { ...DEFAULT_BOOKING, enabled: true, daysAhead: 1, minLeadMin: 30 }, shopHours, now, counts: [], mode: "online" });
    expect(days[0].state).toBe("over");
    expect(days[1].slots.map((x) => x.time)).toEqual(["00:30", "00:45"]);
    // مهلة 24 ساعة: صباح الغد قبل نفس الساعة مستثنى
    const d2 = availability({
      settings: { ...DEFAULT_BOOKING, enabled: true, daysAhead: 2, minLeadMin: 1440 },
      shopHours: { "1": [["07:00", "09:00"]], "2": [["07:00", "09:00"]] },
      now: new Date("2026-10-11T07:00:00Z"), // الأحد 08:00
      counts: [],
      mode: "online",
    });
    expect(d2[1].slots.map((x) => x.time)).toEqual(["08:00", "08:15", "08:30", "08:45"]);
    expect(d2[2].slots[0].time).toBe("07:00");
    // السكرتيرة: ما مضى اليوم فقط
    const desk = availability({ settings: { ...DEFAULT_BOOKING, daysAhead: 1, minLeadMin: 30 }, shopHours, now, counts: [], mode: "desk" });
    expect(desk[1].slots.map((x) => x.time)).toEqual(["00:00", "00:15", "00:30", "00:45"]);
  });

  it("نافذة «وصلت»: من ساعة قبل الموعد حتى المهلة بعده", () => {
    const a = { day: "2026-10-11", time: "10:00" };
    expect(checkinWindow(a, 20, new Date("2026-10-11T08:59:00+01:00"))).toBe("early");
    expect(checkinWindow(a, 20, new Date("2026-10-11T09:00:00+01:00"))).toBe("open");
    expect(checkinWindow(a, 20, new Date("2026-10-11T10:20:00+01:00"))).toBe("open");
    expect(checkinWindow(a, 20, new Date("2026-10-11T10:21:00+01:00"))).toBe("late");
    expect(checkinWindow(a, 20, new Date("2026-10-10T10:00:00+01:00"))).toBe("early");
    expect(slotInstant("2026-10-11", "10:00").toISOString()).toBe("2026-10-11T09:00:00.000Z");
  });
});

// ————————————————————————— الإعدادات —————————————————————————

describe("إعدادات المواعيد", () => {
  it("معطّل افتراضياً، ويرفض القيم غير المنطقية", async () => {
    expect((await ap.bookingSettingsView(shop)).settings).toEqual(DEFAULT_BOOKING);
    for (const bad of [{ slotMin: 3 }, { perSlot: 11 }, { daysAhead: 61 }, { dailyMax: -1 }, { slotMin: 7.5 }, { enabled: "yes" }, { hours: { "0": [["10:00", "09:00"]] } }, { arrivalGraceMin: null }]) {
      await expect(ap.saveBookingSettings(shop, bad)).rejects.toThrow("invalid_settings");
    }
    const s = await enable({ slotMin: 20, perSlot: 2, hours: { "0": [["09:00", "12:00"]] } });
    expect(s).toMatchObject({ enabled: true, slotMin: 20, perSlot: 2, hours: { "0": [["09:00", "12:00"]] } });
    expect((await ap.saveBookingSettings(shop, { hours: null })).hours).toBeNull();
    expect((await ap.bookingSettingsView(shop)).settings.slotMin).toBe(20); // حفظ جزئي يُبقي الباقي
  });
});

// ————————————————————————— الحجز (المريض) —————————————————————————

describe("الحجز عبر الإنترنت", () => {
  it("معطّل ← خطأ واضح، ولا يظهر في صفحة العيادة", async () => {
    await expect(ap.publicAvailability(shop.slug)).rejects.toThrow("ap_off");
    await expect(book("2026-10-12", "09:00")).rejects.toThrow("ap_off");
    expect(await ap.bookingTeaser(shop)).toBeNull();
  });

  it("الأيّام والأوقات: من الآن + 30 دقيقة، الجمعة مغلقة، 14 يوماً", async () => {
    await enable();
    const av = await ap.publicAvailability(shop.slug);
    expect(av.days).toHaveLength(15);
    expect(av.days[0].slots[0]).toEqual({ time: "08:30", left: 1 });
    expect(av.days.find((d) => d.day === "2026-10-16")!.state).toBe("closed");
    expect((await ap.bookingTeaser(shop))!.next).toEqual({ day: "2026-10-11", time: "08:30" });
  });

  it("رمز SMS ← موعد مؤكَّد، والوقت ينقص من المتاح", async () => {
    await enable();
    const r = await book("2026-10-12", "09:00", "0660 12 34 56", "سميرة");
    expect(r.existing).toBe(false);
    const v = await ap.appointmentView(r.appointmentId);
    expect(v).toMatchObject({ day: "2026-10-12", time: "09:00", status: "booked", name: "سميرة", phone: "0660 •• •• 56", canCancel: true, canCheckin: false, window: "early" });
    const day = (await ap.publicAvailability(shop.slug)).days.find((d) => d.day === "2026-10-12")!;
    expect(day.slots.find((s) => s.time === "09:00")!.left).toBe(0);
    expect(day.booked).toBe(1);
  });

  it("الرمز الخاطئ يُحسب (لا يلغيه التراجع)، والرمز لا يُستهلك إن سُبق إلى الوقت", async () => {
    await enable();
    const phone = newPhone();
    const c = await ap.requestBookingCode(shop.slug, { name: "علي علي", phone, day: "2026-10-12", time: "10:00" });
    for (let i = 0; i < 5; i++) {
      await expect(ap.bookOnline(shop.slug, { name: "علي علي", phone, day: "2026-10-12", time: "10:00", code: "000000" })).rejects.toThrow("invalid_code");
    }
    await expect(ap.bookOnline(shop.slug, { name: "علي علي", phone, day: "2026-10-12", time: "10:00", code: c.devCode })).rejects.toThrow("code_expired");

    const p2 = newPhone();
    const c2 = await ap.requestBookingCode(shop.slug, { name: "سارة", phone: p2, day: "2026-10-12", time: "11:00" });
    await book("2026-10-12", "11:00"); // سبقها أحدهم
    await expect(ap.bookOnline(shop.slug, { name: "سارة", phone: p2, day: "2026-10-12", time: "11:00", code: c2.devCode })).rejects.toThrow("ap_slot_unavailable");
    const ok = await ap.bookOnline(shop.slug, { name: "سارة", phone: p2, day: "2026-10-12", time: "11:15", code: c2.devCode });
    expect(ok.existing).toBe(false);
    // الرمز استُهلك الآن
    await expect(ap.bookOnline(shop.slug, { name: "سارة", phone: p2, day: "2026-10-13", time: "11:15", code: c2.devCode })).rejects.toThrow("code_expired");
  });

  it("موعد نشط واحد لكلّ هاتف في اليوم: إعادة الإرسال تُرجع نفس الموعد", async () => {
    await enable();
    const phone = newPhone();
    const a = await book("2026-10-12", "09:00", phone);
    const b = await book("2026-10-12", "12:00", phone);
    expect(b).toEqual({ appointmentId: a.appointmentId, existing: true });
    // بعد الإلغاء يستطيع الحجز من جديد في نفس اليوم
    await ap.appointmentAction(a.appointmentId, { action: "cancel" });
    expect((await book("2026-10-12", "12:00", phone)).appointmentId).not.toBe(a.appointmentId);
  });

  it("بلا تحقّق من الهاتف: حجز ثانٍ بنفس الرقم في نفس اليوم ← 409 دون كشف الموعد الموجود", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    const phone = newPhone();
    const a = await ap.bookOnline(shop.slug, { name: "صاحب الرقم", phone, day: "2026-10-12", time: "09:00" });
    const e = await ap.bookOnline(shop.slug, { name: "منتحل", phone, day: "2026-10-12", time: "10:00" }).catch((x) => x);
    expect(e).toBeInstanceOf(DomainError);
    expect(e).toMatchObject({ code: "ap_already_booked", status: 409 });
    expect(JSON.stringify(e)).not.toContain(a.appointmentId);
    await expect(ap.requestBookingCode(shop.slug, { name: "منتحل", phone, day: "2026-10-12", time: "10:00" })).rejects.toThrow("ap_already_booked");
    // يوم آخر: مسموح
    await expect(ap.bookOnline(shop.slug, { name: "صاحب الرقم", phone, day: "2026-10-13", time: "09:00" })).resolves.toMatchObject({ existing: false });
  });

  it("المهلة الدنيا تشمل الأيّام القادمة (مهلة 24 ساعة)", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable({ minLeadMin: 1440 });
    const go = (time: string) => ap.bookOnline(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-12", time });
    await expect(go("07:45")).rejects.toThrow("ap_slot_unavailable"); // بعد 23 ساعة و45 دقيقة
    await expect(go("08:00")).resolves.toBeTruthy();
    const av = await ap.publicAvailability(shop.slug);
    expect(av.days[0].state).toBe("over");
    expect(av.days[1].slots[0].time).toBe("08:00");
    expect((await ap.bookingTeaser(await fresh()))!.next).toEqual({ day: "2026-10-12", time: "08:15" });
  });

  it("حجوزات متزامنة على نفس الوقت: لا يتجاوز عدد الأماكن أبداً", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable({ perSlot: 2 });
    const res = await Promise.allSettled(
      Array.from({ length: 7 }, (_, i) => ap.bookOnline(shop.slug, { name: `متزامن ${i}`, phone: newPhone(), day: "2026-10-13", time: "09:30" })),
    );
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const r of res) if (r.status === "rejected") expect(String(r.reason)).toContain("ap_slot_unavailable");
    const rows = await db.query<{ n: number }>("select count(*)::int n from appointments where shop_id = $1 and day = '2026-10-13'", [shop.id]);
    expect(rows[0].n).toBe(2);
  });

  it("الحدّ اليومي، الأوقات الماضية والقريبة، الجمعة، وخارج المدّة", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable({ dailyMax: 2 });
    const go = (day: string, time: unknown) => ap.bookOnline(shop.slug, { name: "x x", phone: newPhone(), day, time });
    await go("2026-10-14", "09:00");
    await go("2026-10-14", "10:00");
    await expect(go("2026-10-14", "11:00")).rejects.toThrow("ap_day_full");
    await expect(go("2026-10-11", "08:15")).rejects.toThrow("ap_slot_unavailable"); // أقلّ من 30 دقيقة
    await expect(go("2026-10-11", "07:00")).rejects.toThrow("ap_slot_unavailable"); // مضى
    await expect(go("2026-10-16", "09:00")).rejects.toThrow("ap_slot_unavailable"); // الجمعة
    await expect(go("2026-10-12", "09:07")).rejects.toThrow("ap_slot_unavailable"); // ليس في الشبكة
    await expect(go("2026-10-26", "09:00")).rejects.toThrow("ap_invalid_slot"); // بعد 14 يوماً
    await expect(go("2026-10-10", "09:00")).rejects.toThrow("ap_invalid_slot"); // أمس
    await expect(go("2026-02-31", "09:00")).rejects.toThrow("ap_invalid_slot");
    await expect(go("2026-10-12", "9h")).rejects.toThrow("ap_invalid_slot");
  });

  it("طابور اليوم مغلق ← لا مواعيد لبقيّة اليوم، والأيّام القادمة متاحة", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    await svc.staffAction(await fresh(), { action: "close" });
    const av = await ap.publicAvailability(shop.slug);
    expect(av.days[0].state).toBe("over");
    await expect(ap.bookOnline(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-11", time: "12:00" })).rejects.toThrow("ap_slot_unavailable");
    await expect(ap.bookOnline(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-12", time: "12:00" })).resolves.toBeTruthy();
  });

  it("حدود ضدّ الاستغلال: 3 مواعيد قادمة لكلّ هاتف، ولا حجز لكثير الغياب", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    const phone = newPhone();
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14"]) await ap.bookOnline(shop.slug, { name: "x x", phone, day, time: "09:00" });
    await expect(ap.bookOnline(shop.slug, { name: "x x", phone, day: "2026-10-15", time: "09:00" })).rejects.toThrow("ap_too_many");
    await expect(ap.requestBookingCode(shop.slug, { name: "x x", phone, day: "2026-10-15", time: "09:00" })).rejects.toThrow("ap_too_many");

    const absent = newPhone();
    for (const day of ["2026-10-11", "2026-10-12"]) {
      await ap.bookOnline(shop.slug, { name: "غائب", phone: absent, day, time: "14:00" });
    }
    at("2026-10-12", "15:00");
    await svc.runCron();
    const rows = await db.query<{ n: number }>("select count(*)::int n from no_shows where shop_id = $1 and phone = $2", [shop.id, "+213" + absent.slice(1)]);
    expect(rows[0].n).toBe(2);
    await expect(ap.bookOnline(shop.slug, { name: "غائب", phone: absent, day: "2026-10-14", time: "10:00" })).rejects.toThrow("ap_no_shows");
    // السكرتيرة تستطيع دائماً
    await expect(desk({ phone: absent, day: "2026-10-14", time: "10:00" })).resolves.toBeTruthy();
  });

  it("الاشتراك المنتهي يوقف الحجز والوصول", async () => {
    await enable();
    const r = await book("2026-10-12", "09:00");
    advance(61 * 24 * 60);
    await expect(ap.publicAvailability(shop.slug)).rejects.toThrow("subscription");
    expect(await ap.bookingTeaser(await fresh())).toBeNull();
    expect((await ap.appointmentView(r.appointmentId)).status).toBe("no_show");
  });
});

// ————————————————————————— الإلغاء —————————————————————————

describe("الإلغاء", () => {
  it("المريض يلغي حتى بداية الموعد، والوقت يتحرّر", async () => {
    await enable();
    const r = await book("2026-10-11", "10:00");
    const v = (await ap.appointmentAction(r.appointmentId, { action: "cancel" })).view;
    expect(v.status).toBe("cancelled");
    expect((await ap.publicAvailability(shop.slug)).days[0].slots.find((s) => s.time === "10:00")!.left).toBe(1);
    await expect(ap.appointmentAction(r.appointmentId, { action: "cancel" })).rejects.toThrow("ap_closed");

    const r2 = await book("2026-10-11", "10:00");
    at("2026-10-11", "10:00");
    await expect(ap.appointmentAction(r2.appointmentId, { action: "cancel" })).rejects.toThrow("ap_cancel_late");
    // السكرتيرة تستطيع
    await ap.staffAppointmentAction(await fresh(), { action: "cancel", id: r2.appointmentId });
    expect((await ap.appointmentView(r2.appointmentId)).status).toBe("cancelled");
  });

  it("رابط موعد غير موجود أو غير صالح", async () => {
    await expect(ap.appointmentView("not-a-uuid")).rejects.toThrow("ap_not_found");
    await expect(ap.appointmentView("8a6e0804-2bd0-4672-b79d-d97027f9071a")).rejects.toThrow("ap_not_found");
  });
});

// ————————————————————————— الوصول ← تذكرة ذات أولوية —————————————————————————

describe("الوصول: موعد ← تذكرة ذات أولوية", () => {
  async function walkIn(name: string) {
    const prev = process.env.PHONE_VERIFICATION;
    process.env.PHONE_VERIFICATION = "off";
    try {
      return await svc.takeTicket(shop.slug, { name, phone: newPhone() });
    } finally {
      if (prev === undefined) delete process.env.PHONE_VERIFICATION;
      else process.env.PHONE_VERIFICATION = prev;
    }
  }

  it("قبل الوقت ← مبكّر؛ في النافذة ← تذكرة بأولوية تتقدّم الطابور، والضغطة الثانية نفس التذكرة", async () => {
    await enable();
    const r = await book("2026-10-11", "10:30");
    await walkIn("أحمد");
    await walkIn("بشير");
    await expect(ap.appointmentAction(r.appointmentId, { action: "checkin" })).rejects.toThrow("ap_checkin_early");

    at("2026-10-11", "09:40");
    const a = await ap.appointmentAction(r.appointmentId, { action: "checkin" });
    expect(a.ticketId).toBeTruthy();
    expect(a.view.status).toBe("arrived");
    expect(a.view.ticket?.number).toBe(3);
    const again = await ap.appointmentAction(r.appointmentId, { action: "checkin" });
    expect(again.ticketId).toBe(a.ticketId);

    const tv = await svc.ticketView(a.ticketId!);
    expect(tv.priority).toBe(true);
    expect(tv.arrived).toBe(false); // بلا رمز الباب: الحضور غير مؤكَّد
    expect(tv.ahead).toBe(0);
    const st = await staffState();
    expect(st.waiting.map((w) => [w.number, w.priority])).toEqual([[3, true], [1, false], [2, false]]);

    // يمسح رمز الباب بعدها ← «في القاعة»
    await ap.appointmentAction(r.appointmentId, { action: "checkin", door: shop.doorCode });
    expect((await svc.ticketView(a.ticketId!)).arrived).toBe(true);
    await expect(ap.appointmentAction(r.appointmentId, { action: "checkin", door: "wrong" })).rejects.toThrow("bad_door_code");

    // «التالي» ينادي صاحب الموعد أوّلاً
    await svc.staffAction(await fresh(), { action: "next", current: null });
    expect((await staffState()).current?.number).toBe(3);
  });

  it("رقم عادي أُخذ صباحاً ثمّ صار ذا أولوية بموعده: لا يتقدّم صاحب موعد وصل قبله", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    const early = newPhone();
    const tk = await svc.takeTicket(shop.slug, { name: "باكر", phone: early }); // رقم 1 على 08:00
    const rEarly = await ap.bookOnline(shop.slug, { name: "باكر", phone: early, day: "2026-10-11", time: "10:00" });
    const rOther = await ap.bookOnline(shop.slug, { name: "آخر", phone: newPhone(), day: "2026-10-11", time: "09:30" });
    at("2026-10-11", "09:00");
    const other = await ap.appointmentAction(rOther.appointmentId, { action: "checkin" }); // رقم 2، أولوية على 09:00
    at("2026-10-11", "09:10");
    const e = await ap.appointmentAction(rEarly.appointmentId, { action: "checkin" }); // رقم 1 يصير ذا أولوية الآن
    expect(e.ticketId).toBe(tk.ticketId);
    expect((await staffState()).waiting.map((w) => [w.number, w.priority])).toEqual([
      [2, true],
      [1, true],
    ]);
    const rows = await db.query<{ priority_at: Date | string }>("select priority_at from tickets where id = $1", [tk.ticketId]);
    expect(new Date(rows[0].priority_at)).toEqual(clock);
    expect((await svc.ticketView(other.ticketId!)).ahead).toBe(0);
    // الضغطة الثانية لا تغيّر لحظة الأولوية
    advance(5);
    await ap.appointmentAction(rEarly.appointmentId, { action: "checkin" });
    const again = await db.query<{ priority_at: Date | string }>("select priority_at from tickets where id = $1", [tk.ticketId]);
    expect(new Date(again[0].priority_at)).toEqual(new Date(rows[0].priority_at));
  });

  it("ضغطات متزامنة على «وصلت»: تذكرة واحدة فقط", async () => {
    await enable();
    const r = await book("2026-10-11", "08:45");
    const res = await Promise.all(Array.from({ length: 5 }, () => ap.appointmentAction(r.appointmentId, { action: "checkin", door: shop.doorCode })));
    expect(new Set(res.map((x) => x.ticketId)).size).toBe(1);
    const rows = await db.query<{ n: number }>("select count(*)::int n from tickets where shop_id = $1", [shop.id]);
    expect(rows[0].n).toBe(1);
    expect((await svc.ticketView(res[0].ticketId!)).arrived).toBe(true);
  });

  it("له رقم عادي اليوم بنفس الهاتف ← تصير تذكرته ذات أولوية (لا تذكرة ثانية)", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    const phone = newPhone();
    await walkIn("قبله");
    const tk = await svc.takeTicket(shop.slug, { name: "صاحب الموعد", phone });
    const r = await ap.bookOnline(shop.slug, { name: "صاحب الموعد", phone, day: "2026-10-11", time: "08:30" });
    const st0 = (await ap.staffAppointments(await fresh(), "today")).todayItems[0];
    expect(st0.walkIn).toBe(2);
    const a = await ap.appointmentAction(r.appointmentId, { action: "checkin" });
    expect(a.ticketId).toBe(tk.ticketId);
    expect((await staffState()).waiting.map((w) => w.number)).toEqual([2, 1]);
  });

  it("بعد المهلة ← «لم يحضر» عند القراءة، ويُسجَّل غياباً؛ السكرتيرة تستطيع تسجيل وصوله متأخّراً", async () => {
    await enable({ arrivalGraceMin: 10 });
    const phone = newPhone();
    const r = await book("2026-10-11", "09:00", phone);
    at("2026-10-11", "09:11");
    const v = await ap.appointmentView(r.appointmentId);
    expect(v.status).toBe("no_show");
    expect(v.canCheckin).toBe(false);
    await expect(ap.appointmentAction(r.appointmentId, { action: "checkin" })).rejects.toThrow("ap_closed");
    const ns = () => db.query<{ n: number }>("select count(*)::int n from no_shows where ticket_id = $1", [r.appointmentId]);
    expect((await ns())[0].n).toBe(1);

    const out = await ap.staffAppointmentAction(await fresh(), { action: "checkin", id: r.appointmentId });
    expect(out.number).toBe(1);
    expect((await ap.appointmentView(r.appointmentId)).status).toBe("arrived");
    expect((await ns())[0].n).toBe(0); // وصل: يُمحى الغياب
    expect((await svc.ticketView(out.ticketId!)).arrived).toBe(true);
  });

  it("أخذ رقماً عادياً قبل نافذة الوصول ولم يضغط «وصلت» ← لا يُحسب غائباً", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    at("2026-10-11", "07:00");
    const phone = newPhone();
    const r = await ap.bookOnline(shop.slug, { name: "س س", phone, day: "2026-10-11", time: "09:00" });
    const tk = await svc.takeTicket(shop.slug, { name: "س س", phone });
    expect((await svc.ticketView(tk.ticketId)).priority).toBe(false); // قبل النافذة: رقم عادي
    at("2026-10-11", "12:00");
    await svc.runCron();
    const v = await ap.appointmentView(r.appointmentId);
    expect(v.status).toBe("arrived");
    expect(v.ticket?.id).toBe(tk.ticketId);
  });

  it("موعد هاتفي ثمّ أخذ رقماً عند الباب بنفس الهاتف ← رقم ذو أولوية تلقائياً", async () => {
    process.env.PHONE_VERIFICATION = "off";
    const phone = newPhone();
    const d = await desk({ phone, day: "2026-10-11", time: "08:30", name: "الحاجّة فاطمة" });
    await svc.takeTicket(shop.slug, { name: "قبلها", phone: newPhone() });
    const tk = await svc.takeTicket(shop.slug, { name: "فاطمة", phone, door: shop.doorCode });
    const tv = await svc.ticketView(tk.ticketId);
    expect(tv).toMatchObject({ priority: true, arrived: true, name: "الحاجّة فاطمة", ahead: 0 });
    const v = await ap.appointmentView(d.id!);
    expect(v.status).toBe("arrived");
    expect(v.ticket?.id).toBe(tk.ticketId);
    // الضغطة الثانية (أو «حضر» من السكرتيرة) لا تُنشئ تذكرة أخرى
    expect((await ap.staffAppointmentAction(await fresh(), { action: "checkin", id: d.id })).ticketId).toBe(tk.ticketId);
  });

  it("يوم آخر ← لا وصول؛ والاشتراك المنتهي يوقف «وصلت»", async () => {
    await enable({ daysAhead: 60 });
    const r = await book("2026-10-12", "09:00");
    await expect(ap.appointmentAction(r.appointmentId, { action: "checkin" })).rejects.toThrow("ap_checkin_early");
    await expect(ap.staffAppointmentAction(await fresh(), { action: "checkin", id: r.appointmentId })).rejects.toThrow("ap_checkin_early");
    const r2 = await book("2026-11-10", "09:00");
    at("2026-11-10", "08:30"); // انتهت التجربة (شهر) على 08:00
    await expect(ap.appointmentAction(r2.appointmentId, { action: "checkin" })).rejects.toThrow("subscription");
  });
});

// ————————————————————————— السكرتيرة —————————————————————————

describe("السكرتيرة", () => {
  it("موعد هاتفي بلا رمز (والهاتف اختياري)، حتى والحجز عبر الإنترنت معطّل", async () => {
    const r = await desk({ day: "2026-10-11", time: "08:00" }); // بلا مهلة 30 دقيقة للسكرتيرة
    expect(r.id).toBeTruthy();
    const phone = newPhone();
    await desk({ phone, day: "2026-10-12", time: "09:00" });
    await expect(desk({ phone, day: "2026-10-12", time: "10:00" })).rejects.toThrow("ap_already_booked");
    await expect(desk({ day: "2026-10-12", time: "09:00" })).rejects.toThrow("ap_slot_unavailable");
    await expect(desk({ name: "x", day: "2026-10-12", time: "11:00" })).rejects.toThrow("invalid_name");

    const st = await ap.staffAppointments(await fresh(), "upcoming");
    expect(st.enabled).toBe(false);
    expect(st.todayItems.map((x) => [x.time, x.source, x.status])).toEqual([["08:00", "desk", "booked"]]);
    const mon = st.days.find((d) => d.day === "2026-10-12")!;
    expect(mon.items).toHaveLength(1);
    expect(mon.booked).toBe(1);
    expect(mon.capacity).toBe(40); // 06:00–16:00 بمواعيد 15 دقيقة
    expect(st.days.some((d) => d.day === "2026-10-16")).toBe(false); // الجمعة مغلقة
    expect(st.summary.upcoming).toBe(1);

    // «حضر» ← تذكرة بأولوية وحاضر
    const c = await ap.staffAppointmentAction(await fresh(), { action: "checkin", id: r.id });
    expect((await staffState()).waiting[0]).toMatchObject({ number: c.number, priority: true, arrived: true });
  });

  it("اشتراك منتهٍ: لا موعد جديد ولا «حضر» من المكتب، والإلغاء يبقى ممكناً", async () => {
    await enable({ daysAhead: 60 });
    const a = await desk({ day: "2026-11-10", time: "09:00" });
    const b = await desk({ day: "2026-11-10", time: "10:00" });
    at("2026-11-10", "08:30"); // انتهت التجربة (شهر) على 08:00
    const e = await desk({ day: "2026-11-10", time: "11:00" }).catch((x) => x);
    expect(e).toMatchObject({ code: "subscription", status: 409 });
    await expect(ap.staffAppointmentAction(await fresh(), { action: "checkin", id: a.id })).rejects.toThrow("subscription");
    const rows = await db.query<{ n: number }>("select count(*)::int n from tickets where shop_id = $1", [shop.id]);
    expect(rows[0].n).toBe(0);
    await expect(ap.staffAppointmentAction(await fresh(), { action: "cancel", id: b.id })).resolves.toEqual({ ok: true });
  });

  it("تقصير مدّة الحجز بعد الحجز: المواعيد البعيدة تبقى ظاهرة للسكرتيرة", async () => {
    await enable({ daysAhead: 30 });
    const r = await book("2026-11-05", "09:00");
    await ap.saveBookingSettings(shop, { daysAhead: 7 });
    const st = await ap.staffAppointments(await fresh(), "upcoming");
    expect(st.days.find((x) => x.day === "2026-11-05")!.items.map((x) => x.id)).toEqual([r.appointmentId]);
    expect(st.summary.upcoming).toBe(1);
  });

  it("عيادة أخرى لا تستطيع لمس مواعيدي", async () => {
    await enable();
    const r = await book("2026-10-12", "09:00");
    const other = await svc.createShop({ name: "أخرى", slug: `rdv-other-${n}`, kind: "doctor", pin: "1111", email: "o@example.com" });
    await expect(ap.staffAppointmentAction(other, { action: "cancel", id: r.appointmentId })).rejects.toThrow("ap_not_found");
    await expect(ap.staffAppointmentAction(other, { action: "checkin", id: r.appointmentId })).rejects.toThrow("ap_not_found");
    expect((await ap.appointmentView(r.appointmentId)).status).toBe("booked");
  });
});

// ————————————————————————— التحقّق: هاتف العيادة والحدود —————————————————————————

describe("رموز الحجز: هاتف العيادة والحدود", () => {
  it("بلا مزوّد عامّ: هاتف العيادة يرسل رموز الحجز، والحجز متاح", async () => {
    const real = gate.transport.request;
    const sent: { url: string; body: { phoneNumbers: string[]; textMessage: { text: string } } }[] = [];
    gate.transport.request = async (r) => {
      if (/\/devices$/.test(r.url)) return { ok: true, status: 200, text: JSON.stringify([{ id: "d1", name: "Galaxy A10" }]) };
      sent.push({ url: r.url, body: JSON.parse(r.body!) });
      return { ok: true, status: 202, text: JSON.stringify({ id: `m${sent.length}`, state: "Pending" }) };
    };
    process.env.SMS_PROVIDER = "off";
    sentSms.length = 0;
    try {
      await enable();
      // لا وسيلة إرسال: الوضع التلقائي يحجز بلا رمز
      expect((await ap.publicAvailability(shop.slug)).verify).toBe("none");
      expect(await ap.bookingTeaser(await fresh())).not.toBeNull();
      await expect(ap.requestBookingCode(shop.slug, { name: "سميرة", phone: newPhone(), day: "2026-10-12", time: "09:00" })).resolves.toMatchObject({ sent: false, verify: false });
      // التحقّق مفروض ← «غير متاح» حتّى تُربط وسيلة
      process.env.PHONE_VERIFICATION = "on";
      try {
        expect((await ap.publicAvailability(shop.slug)).verify).toBe("unavailable");
        expect(await ap.bookingTeaser(await fresh())).toBeNull();
        await expect(ap.requestBookingCode(shop.slug, { name: "سميرة", phone: newPhone(), day: "2026-10-12", time: "09:00" })).rejects.toThrow("sms_unavailable");
      } finally {
        delete process.env.PHONE_VERIFICATION;
      }

      await gate.saveSmsSettings(shop, { username: "K7QX2M", password: "pw-123456" });
      expect((await ap.publicAvailability(shop.slug)).verify).toBe("sms");
      expect((await ap.bookingSettingsView(await fresh())).verify).toBe("sms");
      expect(await ap.bookingTeaser(await fresh())).not.toBeNull();
      const phone = newPhone();
      const c = await ap.requestBookingCode(shop.slug, { name: "سميرة", phone, day: "2026-10-12", time: "09:00" });
      expect(c).toMatchObject({ sent: true, verify: true });
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe("https://api.sms-gate.app/3rdparty/v1/messages");
      expect(sent[0].body.phoneNumbers).toEqual([`+213${phone.slice(1)}`]);
      expect(sent[0].body.textMessage.text).toContain(c.devCode!);
      expect(sentSms).toHaveLength(0);
      const r = await ap.bookOnline(shop.slug, { name: "سميرة", phone, day: "2026-10-12", time: "09:00", code: c.devCode });
      expect(r.existing).toBe(false);
      // رموز الحجز عبر الشريحة تُحسب في حصّتها
      expect(await rateCount(db, gate.limitKey.codes(shop.id), 3600_000, clock)).toBe(1);
    } finally {
      gate.transport.request = real;
      await gate.settled();
    }
  });

  it("حدّ لكلّ عميل (عنوان IP): 5 رموز حجز و10 رموز أرقام كلّ 10 دقائق", async () => {
    await enable();
    const ask = (ip: string) => ap.requestBookingCode(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-12", time: "09:00" }, { ip });
    for (let i = 0; i < IP_LIMITS.booking; i++) await ask("198.51.100.7");
    const e = await ask("198.51.100.7").catch((x) => x);
    expect(e).toMatchObject({ code: "too_many_codes", status: 429 });
    await expect(ask("198.51.100.8")).resolves.toMatchObject({ sent: true }); // عميل آخر
    // IPv6: نفس /64 = نفس العميل
    for (let i = 0; i < IP_LIMITS.booking; i++) await ask(`2001:db8:5:7::${i + 1}`);
    await expect(ask("2001:db8:5:7:ffff::9")).rejects.toThrow("too_many_codes");
    await expect(ask("2001:db8:5:8::1")).resolves.toBeTruthy();
    advance(11);
    await expect(ask("198.51.100.7")).resolves.toBeTruthy();

    // أخذ رقم: نفس الفكرة بحدّ أعلى
    const take = (ip: string) => svc.requestCode(shop.slug, { name: "x x", phone: newPhone() }, { ip });
    for (let i = 0; i < IP_LIMITS.code; i++) await take("203.0.113.9");
    await expect(take("203.0.113.9")).rejects.toThrow("too_many_codes");
    // بلا تحقّق (لا رسالة) لا يُستهلك شيء
    process.env.PHONE_VERIFICATION = "off";
    await expect(take("203.0.113.9")).resolves.toMatchObject({ sent: false });
    await expect(ask("198.51.100.7")).resolves.toMatchObject({ sent: false });
    // بلا عنوان معروف: لا حدّ للعميل (الحدود الأخرى باقية)
    delete process.env.PHONE_VERIFICATION;
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).resolves.toMatchObject({ sent: true });
  });

  it("عنوان العميل من الترويسات (لا يُخزَّن صريحاً)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.6" }))).toBe("203.0.113.6");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.6", "x-forwarded-for": "6.6.6.6, 203.0.113.6" }))).toBe("203.0.113.6");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "[2001:DB8::1]:443" }))).toBe("2001:db8::1");
    expect(clientIp(new Headers({ "x-forwarded-for": "evil, 1.2.3.4" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
    expect(ipBucket("2001:db8:1:2::1")).toBe(ipBucket("2001:0db8:0001:0002:ffff::7"));
    expect(ipBucket("2001:db8:1:2::1")).not.toBe(ipBucket("2001:db8:1:3::1"));
    expect(ipBucket("::ffff:203.0.113.5")).toBe(ipBucket("203.0.113.5"));
    expect(ipBucket("203.0.113.5")).not.toContain("203");
  });

  it("رموز الحجز لها عدّاد مستقلّ (أقلّ من حدّ الطابور): إغراق صفحة الحجز لا يمنع رموز المرضى عند الباب", async () => {
    await enable();
    const key = ap.bookingCodesKey(shop.id);
    await ap.requestBookingCode(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-12", time: "09:00" });
    expect(await rateCount(db, key, 3600_000, clock)).toBe(1);
    for (let i = 1; i < ap.BOOKING_CODES_PER_HOUR; i++) await claimRate(db, key, 3600_000, ap.BOOKING_CODES_PER_HOUR, clock);
    await expect(ap.requestBookingCode(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-12", time: "09:00" })).rejects.toThrow("too_many_codes");
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).resolves.toMatchObject({ sent: true });
    expect(ap.BOOKING_CODES_PER_HOUR).toBeLessThan(200);
  });
});

// ————————————————————————— الخصوصية والتقويم —————————————————————————

describe("الخصوصية والتقويم", () => {
  it("بعد 30 يوماً من تاريخ الموعد يُمحى الاسم والهاتف", async () => {
    await enable({ daysAhead: 60 });
    const old = await book("2026-10-12", "09:00", newPhone(), "نادية");
    const future = await book("2026-12-01", "09:00", newPhone(), "ليلى"); // حُجز منذ زمن لكنّ تاريخه قادم
    at("2026-11-12", "09:00");
    await svc.runCron();
    const a = await db.query<{ name: string; phone: string | null }>("select name, phone from appointments where id = $1", [old.appointmentId]);
    expect(a[0]).toEqual({ name: "—", phone: null });
    const b = await db.query<{ name: string }>("select name from appointments where id = $1", [future.appointmentId]);
    expect(b[0].name).toBe("ليلى");
  });

  it("ملفّ .ics: توقيت عالمي، نصوص مهرّبة، وأسطر مطويّة", async () => {
    await enable();
    shop = await svc.updateSettings(shop, { name: "عيادة النور; الشفاء, وهران", profile: { address: "12 شارع العربي بن مهيدي، وهران — الطابق الأوّل فوق الصيدلية" } });
    const r = await book("2026-10-12", "09:00");
    const { body, filename } = await ap.appointmentIcs(r.appointmentId, "https://dawri.test");
    expect(filename).toBe("dawri-2026-10-12-0900.ics");
    expect(body).toContain("DTSTART:20261012T080000Z");
    expect(body).toContain("DTEND:20261012T081500Z");
    expect(body).toContain("عيادة النور\\; الشفاء\\, وهران");
    expect(body).toContain("TRIGGER:-PT1H");
    for (const line of body.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    await ap.appointmentAction(r.appointmentId, { action: "cancel" });
    await expect(ap.appointmentIcs(r.appointmentId, "https://dawri.test")).rejects.toThrow("ap_closed");
  });

  it("طيّ الأسطر لا يقطع الحروف العربية", () => {
    const long = "SUMMARY:" + "موعد ".repeat(40);
    const folded = foldLine(long);
    expect(folded.split("\r\n ").join("")).toBe(long);
    const ics = buildIcs({ uid: "x", now: T0, start: T0, end: T0, summary: "a", alarm: "b" });
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("أيّام العطل", () => {
  it("قواعد صافية: تنظيف القائمة، الأعياد الوطنية القادمة، الفترات", () => {
    const today = "2026-10-29";
    expect(
      cleanDaysOff(
        [{ day: "2026-11-01", label: " عيد  الثورة " }, { day: "2026-10-01", label: null }, { day: "2026-11-01", label: "x" }, { day: "2026-10-30" }],
        today,
      ),
    ).toEqual([
      { day: "2026-10-30", label: null },
      { day: "2026-11-01", label: "عيد الثورة" },
    ]);
    for (const bad of ["x", [{ day: "2026-02-30" }], [{ day: "2029-01-01" }], [{ day: "2026-11-02", label: 5 }], [{ day: "2026-11-02", label: "x".repeat(61) }]]) {
      expect(() => cleanDaysOff(bad, today), JSON.stringify(bad)).toThrow("invalid_settings");
    }
    expect(upcomingFixedHolidays(today).map((h) => h.day)).toEqual(["2026-11-01", "2027-01-01", "2027-01-12", "2027-05-01", "2027-07-05"]);
    expect(upcomingFixedHolidays("2026-11-01")[0]).toEqual({ day: "2026-11-01", key: "do_h_revolution" });
    expect(dayRange("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    const days = availability({ settings: DEFAULT_BOOKING, shopHours: (shop as Shop).hours, now: clock, counts: [], mode: "desk", daysOff: [{ day: "2026-10-12" }] });
    expect(days.find((d) => d.day === "2026-10-12")).toMatchObject({ state: "off", slots: [] });
  });

  it("يوم عطلة: لا أرقام ولا حجز، والعيادة «مغلقة»؛ المواعيد المحجوزة قبلها يُنبَّه إليها", async () => {
    await enable();
    process.env.PHONE_VERIFICATION = "off";
    await ap.bookOnline(shop.slug, { name: "سميرة", phone: newPhone(), day: "2026-10-12", time: "09:00" });
    const v = await saveDaysOff(await fresh(), [
      { day: "2026-10-12", label: null },
      { day: "2026-10-11", label: "عطلة" },
    ]);
    expect(v.items).toEqual([
      { day: "2026-10-11", label: "عطلة", booked: 0 },
      { day: "2026-10-12", label: null, booked: 1 },
    ]);
    // الطابور: لا أرقام اليوم
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).rejects.toThrow("day_off");
    await expect(svc.takeTicket(shop.slug, { name: "x x", phone: newPhone() })).rejects.toThrow("day_off");
    const pub = (await svc.publicShop(shop.slug)).view;
    expect(pub).toMatchObject({ blocker: "day_off", hoursToday: [] });
    expect((await svc.staffState(await fresh())).blocker).toBe("day_off");
    // الحجز: الغد عطلة، وبعده مفتوح
    const days = (await ap.publicAvailability(shop.slug)).days;
    expect(days.find((d) => d.day === "2026-10-12")).toMatchObject({ state: "off", slots: [] });
    expect(days.find((d) => d.day === "2026-10-13")?.state).toBe("open");
    await expect(ap.bookOnline(shop.slug, { name: "سميرة", phone: newPhone(), day: "2026-10-12", time: "10:00" })).rejects.toThrow("ap_slot_unavailable");
    expect((await ap.deskAvailability(await fresh())).days.find((d) => d.day === "2026-10-12")?.state).toBe("off");
    // اليوم التالي: العطلة الماضية لا تظهر وتُحذف عند الحفظ
    advance(24 * 60);
    expect((await daysOffView(await fresh())).items.map((d) => d.day)).toEqual(["2026-10-12"]);
    expect((await saveDaysOff(await fresh(), [{ day: "2026-10-11" }])).items).toEqual([]);
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).resolves.toBeTruthy();
    await expect(saveDaysOff(await fresh(), Array.from({ length: 121 }, (_, i) => ({ day: addDays("2026-10-12", i) })))).rejects.toThrow("days_off_too_many");
  });
});

describe("سبب الزيارة (يقرّره الطبيب)", () => {
  const LIST = { mode: "list" as const, required: true, options: ["كشف عامّ", "مراجعة"], caps: {} };

  it("قواعد صافية: الإعداد الافتراضي، القائمة، النصّ الحرّ", () => {
    expect(defaultReasonConfig("doctor")).toEqual({ mode: "text", required: true, options: [], caps: {} });
    expect(defaultReasonConfig("barber").mode).toBe("off");
    expect(readReasonConfig("doctor", { mode: "list", options: ["أ"], required: false })).toEqual({ mode: "list", required: false, options: ["أ"], caps: {} });
    expect(readReasonConfig("dentist", "garbage")).toEqual(defaultReasonConfig("dentist"));
    // قائمة: اختيارات الطبيب فقط
    expect(cleanReason(LIST, " مراجعة ")).toBe("مراجعة");
    expect(() => cleanReason(LIST, "ألم في الصدر")).toThrow("invalid_reason");
    expect(cleanReason(LIST, "")).toBeNull();
    // نصّ حرّ: قصير ونظيف
    const TEXT = defaultReasonConfig("doctor");
    expect(cleanReason(TEXT, "  ألم   في الظهر\u202e ")).toBe("ألم في الظهر");
    expect(() => cleanReason(TEXT, "x".repeat(121))).toThrow("reason_too_long");
    expect(() => cleanReason(TEXT, 5)).toThrow("invalid_reason");
    // لا سؤال: أيّ قيمة تُتجاهل؛ وقائمة فارغة = لا سؤال
    expect(cleanReason({ mode: "off", required: true, options: [], caps: {} }, "شيء")).toBeNull();
    expect(activeReasonConfig({ mode: "list", required: true, options: [], caps: {} }).mode).toBe("off");
    // إعداد الطبيب من صفحة الإعدادات
    expect(cleanReasonConfig({ mode: "list", required: false, options: [" أ ", "أ", "ب"] })).toEqual({ mode: "list", required: false, options: ["أ", "ب"], caps: {} });
    expect(() => cleanReasonConfig({ mode: "list", required: true, options: [] })).toThrow("reason_no_options");
    expect(() => cleanReasonConfig({ mode: "maybe", required: true })).toThrow("invalid_settings");
    expect(() => cleanReasonConfig({ mode: "list", required: true, options: ["x".repeat(41)] })).toThrow("invalid_settings");
    // رموز الإصدار السابق تُعرض مترجمة، والنصوص كما هي
    expect(reasonText("ar", "followup")).toBe("مراجعة (متابعة)");
    expect(reasonText("fr", "ألم في الظهر")).toBe("ألم في الظهر");
  });

  it("الطبيب يختار: نصّ حرّ افتراضياً، ثمّ قائمته، ثمّ لا سؤال — في الرقم والموعد", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    // افتراضياً: المريض يكتب ما يريد
    expect((await svc.publicShop(shop.slug)).view.reason).toEqual({ mode: "text", required: true, options: [], caps: {} });
    const tk = await svc.takeTicket(shop.slug, { name: "سعاد", phone: newPhone(), reason: "نتائج تحاليل الدم" });
    expect((await svc.ticketView(tk.ticketId)).reason).toBe("نتائج تحاليل الدم");

    // قائمة يكتبها الطبيب
    expect((await saveReasonSettings(await fresh(), LIST)).config).toEqual(LIST);
    expect((await svc.publicShop(shop.slug)).view.reason).toEqual(LIST);
    expect((await svc.staffState(await fresh())).shop.reason).toEqual(LIST);
    expect((await ap.deskAvailability(await fresh())).reason).toEqual(LIST);
    await expect(svc.takeTicket(shop.slug, { name: "x x", phone: newPhone(), reason: "شيء آخر" })).rejects.toThrow("invalid_reason");
    await svc.staffAction(await fresh(), { action: "add", name: "عمر", reason: "كشف عامّ" });
    await svc.staffAction(await fresh(), { action: "add", name: "بلا سبب" });
    expect(Object.fromEntries((await staffState()).waiting.map((w) => [w.name, w.reason]))).toEqual({ سعاد: "نتائج تحاليل الدم", عمر: "كشف عامّ", "بلا سبب": null });

    const r = await ap.bookOnline(shop.slug, { name: "مريم", phone: newPhone(), day: "2026-10-11", time: "10:00", reason: "مراجعة" });
    expect(await ap.appointmentView(r.appointmentId)).toMatchObject({ name: "مريم", reason: "مراجعة", day: "2026-10-11", time: "10:00" });
    const desk = await ap.staffAppointmentAction(await fresh(), { action: "book", name: "هاتفي", day: "2026-10-11", time: "11:00", reason: "كشف عامّ" });
    const items = (await ap.staffAppointments(await fresh(), "today")).todayItems;
    expect(items.find((a) => a.id === desk.id)?.reason).toBe("كشف عامّ");
    await expect(ap.bookOnline(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-11", time: "12:00", reason: "غير موجود" })).rejects.toThrow("invalid_reason");

    // وصل صاحب الموعد ← السبب ينتقل إلى تذكرته
    at("2026-10-11", "09:30");
    const c = await ap.appointmentAction(r.appointmentId, { action: "checkin" });
    expect((await svc.ticketView(c.ticketId!)).reason).toBe("مراجعة");

    // لا سؤال: لا يُحفظ أيّ سبب
    await saveReasonSettings(await fresh(), { mode: "off", required: false, options: [] });
    const t3 = await svc.takeTicket(shop.slug, { name: "بلال", phone: newPhone(), reason: "أيّ شيء" });
    expect((await svc.ticketView(t3.ticketId)).reason).toBeNull();
    await expect(saveReasonSettings(await fresh(), { mode: "list", required: true, options: [] })).rejects.toThrow("reason_no_options");
  });

  it("السبب (قد يكون نصّاً حرّاً) يُمحى مع الاسم والهاتف بعد 30 يوماً", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    const tk = await svc.takeTicket(shop.slug, { name: "سعاد", phone: newPhone(), reason: "ألم في الركبة" });
    const r = await ap.bookOnline(shop.slug, { name: "مريم", phone: newPhone(), day: "2026-10-12", time: "10:00", reason: "مراجعة بعد العملية" });
    advance(45 * 24 * 60);
    await repo.purgeOld(db, clock, clock, new Date(clock.getTime() - 30 * 24 * 3600_000));
    await apr.anonymizeBefore(db, "2026-11-20");
    const rows = await db.query<{ reason: string | null }>("select reason from tickets where id = $1", [tk.ticketId]);
    const ar2 = await db.query<{ reason: string | null }>("select reason from appointments where id = $1", [r.appointmentId]);
    expect(ar2[0].reason).toBeNull();
    expect(rows[0].reason).toBeNull();
  });
});

// ————————————————————————— حدود التسجيل (يقرّرها الطبيب) —————————————————————————

describe("حدود التسجيل: حدّ يوميّ لكلّ حالة، ومهلة بين تسجيلين لنفس الهاتف", () => {
  /** الخطأ المتوقَّع (برمزه ومتغيّراته) */
  async function fails(p: Promise<unknown>): Promise<DomainError> {
    try {
      await p;
    } catch (e) {
      return e as DomainError;
    }
    throw new Error("expected a DomainError");
  }
  const LIST = { mode: "list" as const, required: false, options: ["حشو", "كشف"], caps: { حشو: 2 } };

  it("قواعد صافية: الحدود المحفوظة، التحقّق، وتاريخ التسجيل التالي", () => {
    expect(readReasonConfig("dentist", { mode: "list", required: true, options: ["حشو"], caps: { حشو: 6, محذوف: 3, كشف: 0 } }).caps).toEqual({ حشو: 6 });
    expect(cleanReasonConfig({ mode: "list", required: true, options: ["حشو", "كشف"], caps: { " حشو ": "6", كشف: "" } }).caps).toEqual({ حشو: 6 });
    expect(() => cleanReasonConfig({ mode: "list", required: true, options: ["حشو"], caps: { حشو: 201 } })).toThrow("invalid_settings");
    expect(() => cleanReasonConfig({ mode: "list", required: true, options: ["حشو"], caps: { حشو: 2.5 } })).toThrow("invalid_settings");
    expect(reasonCap(LIST, "حشو")).toBe(2);
    expect(reasonCap(LIST, "كشف")).toBeNull();
    expect(reasonCap({ ...LIST, mode: "text" }, "حشو")).toBeNull();

    expect(readLimits(null)).toEqual(DEFAULT_LIMITS);
    expect(readLimits({ phoneDays: 99, phoneScope: "x", staffOverride: false })).toEqual({ ...DEFAULT_LIMITS, staffOverride: false });
    expect(cleanLimits({ phoneDays: "7", phoneScope: "all", staffOverride: false })).toEqual({ phoneDays: 7, phoneScope: "all", staffOverride: false });
    for (const bad of [{ phoneDays: 31, phoneScope: "all", staffOverride: true }, { phoneDays: -1, phoneScope: "all", staffOverride: true }, { phoneDays: 3, phoneScope: "x", staffOverride: true }, { phoneDays: 3, phoneScope: "all" }]) {
      expect(() => cleanLimits(bad)).toThrow("invalid_settings");
    }
    // 7 أيّام من يوم التسجيل: سجّل يوم 11 ← من جديد يوم 18
    const c = { ...DEFAULT_LIMITS, phoneDays: 7 };
    expect(phoneWaitUntil(c, "2026-10-11", "2026-10-17")).toBe("2026-10-18");
    expect(phoneWaitUntil(c, "2026-10-11", "2026-10-18")).toBeNull();
    expect(phoneWaitUntil(DEFAULT_LIMITS, "2026-10-11", "2026-10-12")).toBeNull();
    // نصّ الخطأ يكتب التاريخ، وللطاقم نصّ خاصّ
    expect(errorText("ar", "phone_wait", { day: "2026-10-18" })).toContain("18");
    expect(errorText("ar", "phone_wait", { day: "2026-10-18" }, true)).toContain("هذا الهاتف");
    expect(errorText("ar", "reason_full", { reason: "حشو", max: 6 })).toContain("«حشو»");
    expect(errorText("fr", "reason_full")).toContain("atteint");
  });

  it("حدّ الحالة: الطابور والمواعيد معاً، الموعد الذي وصل لا يُحسب مرّتين، والسكرتيرة تتجاوز إن سُمح لها", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    await saveReasonSettings(await fresh(), LIST);
    const t1 = await svc.takeTicket(shop.slug, { name: "رقم أوّل", phone: newPhone(), reason: "حشو" });
    const appt = await ap.bookOnline(shop.slug, { name: "موعد", phone: newPhone(), day: "2026-10-11", time: "10:00", reason: "حشو" });

    // اكتمل «حشو» اليوم: معطّل في الصفحة، ومرفوض في كلّ المسارات
    expect((await svc.publicShop(shop.slug)).view.reasonFull).toEqual(["حشو"]);
    expect((await ap.publicAvailability(shop.slug)).full).toEqual({ "2026-10-11": ["حشو"] });
    expect((await svc.staffState(await fresh())).shop).toMatchObject({ reasonFull: ["حشو"], limitsOverride: true });
    const e1 = await fails(svc.takeTicket(shop.slug, { name: "x x", phone: newPhone(), reason: "حشو" }));
    expect([e1.code, e1.vars]).toEqual(["reason_full", { reason: "حشو", max: 2 }]);
    expect((await fails(svc.requestCode(shop.slug, { name: "x x", phone: newPhone(), reason: "حشو" }))).code).toBe("reason_full");
    expect((await fails(ap.requestBookingCode(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-11", time: "11:00", reason: "حشو" }))).code).toBe("reason_full");
    expect((await fails(ap.bookOnline(shop.slug, { name: "x x", phone: newPhone(), day: "2026-10-11", time: "11:00", reason: "حشو" }))).code).toBe("reason_full");
    // حالة أخرى، أو يوم آخر: مفتوح
    await svc.takeTicket(shop.slug, { name: "كشف", phone: newPhone(), reason: "كشف" });
    await ap.bookOnline(shop.slug, { name: "غداً", phone: newPhone(), day: "2026-10-12", time: "10:00", reason: "حشو" });

    // السكرتيرة: تنبيه أوّلاً (override)، ثمّ «أضف رغم ذلك»
    const e2 = await fails(svc.staffAction(await fresh(), { action: "add", name: "مستعجل", reason: "حشو" }));
    expect([e2.code, e2.vars]).toEqual(["reason_full", { reason: "حشو", max: 2, override: 1 }]);
    await svc.staffAction(await fresh(), { action: "add", name: "مستعجل", reason: "حشو", force: true });
    expect((await fails(desk({ day: "2026-10-11", time: "11:00", reason: "حشو" }))).vars?.override).toBe(1);
    await desk({ day: "2026-10-11", time: "11:00", reason: "حشو", force: true });
    // الطبيب يمنع التجاوز: لا أحد يتجاوز، ولا زرّ «أضف رغم ذلك»
    await saveLimitsSettings(await fresh(), { phoneDays: 0, phoneScope: "appts", staffOverride: false });
    const e3 = await fails(svc.staffAction(await fresh(), { action: "add", name: "ممنوع", reason: "حشو", force: true }));
    expect([e3.code, e3.vars]).toEqual(["reason_full", { reason: "حشو", max: 2 }]);

    // الموعد الذي وصل يصير تذكرة: يُحسب مرّة واحدة. ما أُلغي يحرّر مكانه.
    await saveReasonSettings(await fresh(), { ...LIST, caps: { حشو: 4 } }); // الآن: رقم + موعد + رقم مستعجل + موعد هاتفي = 4
    at("2026-10-11", "09:45");
    await ap.appointmentAction(appt.appointmentId, { action: "checkin" });
    expect((await svc.publicShop(shop.slug)).view.reasonFull).toEqual(["حشو"]);
    await svc.ticketAction(t1.ticketId, { action: "cancel" });
    expect((await svc.publicShop(shop.slug)).view.reasonFull).toEqual([]);
    await svc.takeTicket(shop.slug, { name: "مكان محرَّر", phone: newPhone(), reason: "حشو" });
    expect((await fails(svc.takeTicket(shop.slug, { name: "x x", phone: newPhone(), reason: "حشو" }))).code).toBe("reason_full");
  });

  it("مهلة الهاتف للمواعيد فقط: من يوم التسجيل، الطابور مفتوح، والملغى لا يُحسب", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    expect(limitsSettingsView(await fresh()).config).toEqual(DEFAULT_LIMITS);
    expect((await saveLimitsSettings(await fresh(), { phoneDays: 7, phoneScope: "appts", staffOverride: true })).config.phoneDays).toBe(7);
    const p = newPhone();
    await ap.bookOnline(shop.slug, { name: "سمير", phone: p, day: "2026-10-14", time: "10:00" });
    // حجز ثانٍ (يوم آخر) قبل مرور 7 أيّام من يوم الحجز (11) ← ممنوع حتى 18
    const e = await fails(ap.bookOnline(shop.slug, { name: "سمير", phone: p, day: "2026-10-20", time: "10:00" }));
    expect([e.code, e.vars]).toEqual(["phone_wait", { day: "2026-10-18" }]);
    expect((await fails(ap.requestBookingCode(shop.slug, { name: "سمير", phone: p, day: "2026-10-20", time: "10:00" }))).code).toBe("phone_wait");
    // نفس اليوم: «لديك موعد» كما كان، لا مهلة
    expect((await fails(ap.requestBookingCode(shop.slug, { name: "سمير", phone: p, day: "2026-10-14", time: "11:00" }))).code).toBe("ap_already_booked");
    // المواعيد فقط: أخذ رقم اليوم مفتوح
    await svc.takeTicket(shop.slug, { name: "سمير", phone: p });
    // السكرتيرة: تنبيه ثمّ تجاوز
    expect((await fails(desk({ phone: p, day: "2026-10-20", time: "11:00" }))).vars).toEqual({ day: "2026-10-18", override: 1 });
    await desk({ phone: p, day: "2026-10-20", time: "11:00", force: true });
    // الملغى لا يُحسب
    const q = newPhone();
    const first = await ap.bookOnline(shop.slug, { name: "ليلى", phone: q, day: "2026-10-14", time: "11:00" });
    await ap.appointmentAction(first.appointmentId, { action: "cancel" });
    await ap.bookOnline(shop.slug, { name: "ليلى", phone: q, day: "2026-10-15", time: "11:00" });
    // يوم 18: مرّت 7 أيّام
    at("2026-10-17", "08:00");
    expect((await fails(ap.bookOnline(shop.slug, { name: "سمير", phone: p, day: "2026-10-25", time: "10:00" }))).code).toBe("phone_wait");
    at("2026-10-18", "08:00");
    await ap.bookOnline(shop.slug, { name: "سمير", phone: p, day: "2026-10-25", time: "10:00" });
  });

  it("مهلة الهاتف للمواعيد والطابور: الرقم يُحسب، وصاحب موعد اليوم يأخذ رقمه", async () => {
    process.env.PHONE_VERIFICATION = "off";
    await enable();
    await saveLimitsSettings(await fresh(), { phoneDays: 3, phoneScope: "all", staffOverride: true });
    const p = newPhone();
    await svc.takeTicket(shop.slug, { name: "كريم", phone: p });
    // رقم اليوم ثمّ موعد بعد يوم: ممنوع حتى 14
    expect((await fails(ap.bookOnline(shop.slug, { name: "كريم", phone: p, day: "2026-10-12", time: "10:00" }))).vars).toEqual({ day: "2026-10-14" });
    at("2026-10-12", "08:00");
    const e = await fails(svc.takeTicket(shop.slug, { name: "كريم", phone: p }));
    expect([e.code, e.vars]).toEqual(["phone_wait", { day: "2026-10-14" }]);
    expect((await fails(svc.requestCode(shop.slug, { name: "كريم", phone: p }))).code).toBe("phone_wait");
    expect((await fails(svc.staffAction(await fresh(), { action: "add", name: "كريم", phone: p }))).vars?.override).toBe(1);
    await svc.staffAction(await fresh(), { action: "add", name: "كريم", phone: p, force: true });
    // بلا هاتف (كبار السنّ): لا مهلة
    const added = await svc.staffAction(await fresh(), { action: "add", name: "بلا هاتف" });
    // رقم التذكرة ومعرّفها: للطباعة مباشرة بعد الإضافة
    expect((await svc.ticketView(added.ticketId!)).number).toBe(added.number);

    // صاحب موعد اليوم (حُجز قبل أيّام) يأخذ رقمه عادياً: زيارة واحدة
    const r = newPhone();
    await ap.bookOnline(shop.slug, { name: "رانية", phone: r, day: "2026-10-15", time: "15:00" });
    at("2026-10-15", "08:00");
    await svc.takeTicket(shop.slug, { name: "رانية", phone: r });
    // مرّت 3 أيّام على رقم كريم الأوّل (11) والمستعجل (12): يوم 15 مسموح
    await svc.takeTicket(shop.slug, { name: "كريم", phone: p });

    // رقم ملغى لا يُحسب
    const s2 = newPhone();
    const tk = await svc.takeTicket(shop.slug, { name: "سارة", phone: s2 });
    await svc.ticketAction(tk.ticketId, { action: "cancel" });
    await ap.bookOnline(shop.slug, { name: "سارة", phone: s2, day: "2026-10-18", time: "10:00" });
  });
});

describe("طباعة التذاكر: عرض الورق وحجم الكتابة (إعداد الطبيب)", () => {
  it("قراءة الإعداد والتحقّق منه والحفظ", async () => {
    expect(readPrintConfig(null)).toEqual(DEFAULT_PRINT);
    expect(readPrintConfig({ paper: "58", size: "l", qr: false })).toMatchObject({ paper: 58, size: "l", qr: false, lang: "auto" });
    expect(readPrintConfig({ lang: "both" }).lang).toBe("both");
    expect(readPrintConfig({ lang: "en" }).lang).toBe("auto");
    expect(cleanPrintConfig({ paper: 80, size: "m", qr: true }).lang).toBe("auto"); // صفحة إعدادات قديمة بلا لغة
    expect(() => cleanPrintConfig({ paper: 80, size: "m", qr: true, lang: "en" })).toThrow("invalid_settings");
    expect(readPrintConfig({ paper: 76, size: "xl" })).toEqual(DEFAULT_PRINT);
    for (const bad of [{ paper: 76, size: "m", qr: true }, { paper: 80, size: "xl", qr: true }, { paper: 80, size: "m" }, null]) {
      expect(() => cleanPrintConfig(bad)).toThrow("invalid_settings");
    }
    expect(printSettingsView(await fresh()).config).toEqual(DEFAULT_PRINT);
    await savePrintSettings(await fresh(), { paper: 58, size: "s", qr: false, lang: "fr" });
    expect(printSettingsView(await fresh()).config).toMatchObject({ paper: 58, size: "s", qr: false, lang: "fr" });
  });

  it("تصميم الورقة: العناصر والترتيب والنصوص، والرقم لا يُخفى", async () => {
    // قبل المصمّم: التصميم الأصلي، واسم الطبيب وتخصّصه مخفيّان، وQR حسب الإعداد القديم
    const old = readPrintConfig({ paper: 80, size: "m", qr: false });
    expect(old.ticket.map((b) => b.key)).toEqual(defaultLayout("ticket").map((b) => b.key));
    expect(old.ticket.find((b) => b.key === "doctor")?.show).toBe(false);
    expect(old.ticket.find((b) => b.key === "qr")?.show).toBe(false);
    expect(old.appt.find((b) => b.key === "time")?.show).toBe(true);

    const blk = (key: string, o: Record<string, unknown> = {}) => ({ key, show: true, size: "m", bold: false, align: "center", text: null, ...o });
    const ticket = [
      blk("text-1", { text: "  هاتف العيادة   023 00 00 00 ", bold: true, align: "right" }),
      blk("number", { show: false, size: "xl" }), // الرقم لا يُخفى
      blk("label", { text: "Votre tour", size: "l" }),
      blk("name", { text: "يُتجاهل" }), // نصّ لعنصر لا يُكتب
      blk("line-1"),
      blk("text-2", { text: "   " }), // فارغ: يسقط
      blk("clinic"),
      blk("clinic", { size: "xl" }), // مكرّر: يسقط
      blk("hacker"), // غير معروف: يسقط
    ];
    const c = cleanPrintConfig({ paper: 80, size: "m", qr: true, lang: "ar", ticket });
    const keys = c.ticket.map((b) => b.key);
    expect(keys.slice(0, 5)).toEqual(["text-1", "number", "label", "name", "line-1"]);
    expect(keys).not.toContain("text-2");
    expect(keys).not.toContain("hacker");
    expect(keys.filter((k) => k === "clinic")).toHaveLength(1);
    // عناصر لم تُرسل تُضاف مخفيّة (لا تختفي من القائمة)
    expect(c.ticket.find((b) => b.key === "qr")).toMatchObject({ show: false });
    expect(c.ticket.find((b) => b.key === "text-1")).toMatchObject({ text: "هاتف العيادة 023 00 00 00", bold: true, align: "right" });
    expect(c.ticket.find((b) => b.key === "number")).toMatchObject({ show: true, size: "xl" });
    expect(c.ticket.find((b) => b.key === "label")?.text).toBe("Votre tour");
    expect(c.ticket.find((b) => b.key === "name")?.text).toBeNull();
    // ورقة الموعد لم تُرسل: التصميم الأصلي
    expect(c.appt.map((b) => b.key)).toEqual(defaultLayout("appt").map((b) => b.key));

    // قيم خاطئة من صفحة الإعدادات ← رفض
    for (const bad of [
      [blk("label", { size: "huge" })],
      [blk("label", { align: "start" })],
      [blk("label", { text: "x".repeat(61) })],
      [blk("text-1", { text: "x".repeat(121) })],
      "not a list",
      Array.from({ length: 30 }, (_, i) => blk(`line-${i + 1}`)),
    ]) {
      expect(() => cleanPrintConfig({ paper: 80, size: "m", qr: true, ticket: bad })).toThrow("invalid_settings");
    }
    // المحفوظ التالف لا يكسر الطباعة: يُصلَح بهدوء
    expect(readPrintConfig({ ticket: [blk("label", { size: "huge", text: "x".repeat(200) }), 5, null] }).ticket[0]).toMatchObject({ key: "label", size: "m" });
    expect((readPrintConfig({ ticket: [blk("label", { text: "x".repeat(200) })] }).ticket[0].text ?? "").length).toBe(60);
    // حدّ الأسطر المضافة
    const many = Array.from({ length: 12 }, (_, i) => blk(`text-${i + 1}`, { text: `سطر ${i + 1}` }));
    expect(readPrintConfig({ ticket: many }).ticket.filter((b) => b.key.startsWith("text-"))).toHaveLength(8);

    // الحفظ والقراءة
    await savePrintSettings(await fresh(), { paper: 80, size: "m", qr: true, lang: "fr", ticket });
    expect(printSettingsView(await fresh()).config.ticket[0]).toMatchObject({ key: "text-1", bold: true });
  });
});
