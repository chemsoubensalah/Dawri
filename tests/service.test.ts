/**
 * سيناريوهات كاملة على Postgres حقيقي (PGlite داخل العمليّة) — نفس SQL الإنتاج.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { setNotifier, type Notification } from "@/lib/server/notify";
import * as svc from "@/lib/server/service";
import * as repo from "@/lib/server/repo";
import { readSession } from "@/lib/server/auth";
import type { Shop } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z"); // الأحد 08:00 بتوقيت الجزائر
const advance = (m: number) => (clock = new Date(clock.getTime() + m * 60000));
const sent: Notification[] = [];
const sentTypes = () => sent.map((n) => `${n.ticket.number}:${n.type}`);

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
  // TEST_DATABASE_URL: نفس الاختبارات على Postgres حقيقي عبر مكتبة pg (مسار الإنتاج)
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    db = await createPgDb(url);
    await db.exec("drop schema public cascade; create schema public;");
  } else {
    db = await createPgliteDb();
  }
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setNotifier({ send: async (n) => void sent.push(n) });
});

afterAll(async () => {
  setDb(undefined);
  setClock(undefined);
  setNotifier(undefined);
  await db.close();
});

let shop: Shop;
let n = 0;

beforeEach(async () => {
  clock = new Date("2026-10-11T07:00:00Z");
  sent.length = 0;
  shop = await svc.createShop({ name: "عيادة الاختبار", slug: `clinic-${++n}`, kind: "doctor", pin: "4321" });
});

let phoneSeq = 10;
const newPhone = () => `05500000${String(phoneSeq++).padStart(2, "0")}`;

async function take(name = "زبون", phone = newPhone(), door?: string) {
  const c = await svc.requestCode(shop.slug, { name, phone });
  expect(c.devCode).toMatch(/^\d{6}$/);
  return svc.takeTicket(shop.slug, { name, phone, code: c.devCode, door });
}

async function state() {
  const s = await repo.getShopBySlug(db, shop.slug);
  return svc.staffState(s!);
}

async function act(body: Parameters<typeof svc.staffAction>[1]) {
  const s = await repo.getShopBySlug(db, shop.slug);
  return svc.staffAction(s!, body);
}

async function next(mode: "next" | "no_show_next" = "next") {
  const s = await state();
  return act({ action: mode, current: s.current?.id ?? null });
}

describe("إنشاء المحلّ والدخول", () => {
  it("فترة مجّانية لشهرين، ورمز السكرتيرة مشفّر", async () => {
    const days = (shop.trialEndsAt.getTime() - clock.getTime()) / 86_400_000;
    expect(days).toBe(60);
    expect(shop.pinHash).not.toContain("4321");
    await expect(svc.createShop({ name: "x y", slug: shop.slug, kind: "doctor", pin: "1234" })).rejects.toThrow(
      "slug_taken",
    );
    await expect(svc.createShop({ name: "x y", slug: "AB", kind: "doctor", pin: "1234" })).rejects.toThrow(
      "invalid_slug",
    );
  });

  it("الدخول بالرمز، وقفل بعد 5 محاولات خاطئة", async () => {
    const { token } = await svc.staffLogin(shop.slug, "4321");
    expect(readSession(token, clock)?.shopId).toBe(shop.id);
    for (let i = 0; i < 5; i++) await expect(svc.staffLogin(shop.slug, "0000")).rejects.toThrow("wrong_pin");
    await expect(svc.staffLogin(shop.slug, "4321")).rejects.toThrow("locked");
    advance(16);
    await expect(svc.staffLogin(shop.slug, "4321")).resolves.toBeTruthy();
  });

  it("تغيير الرمز يُبطل الجلسات القديمة (session_version)", async () => {
    const updated = await svc.updateSettings(shop, { newPin: "9999" });
    expect(updated.sessionVersion).toBe(shop.sessionVersion + 1);
  });
});

describe("أخذ رقم", () => {
  it("رمز تحقّق صحيح ← تذكرة برقم متسلسل", async () => {
    const a = await take("أحمد");
    const b = await take("فاطمة");
    const va = await svc.ticketView(a.ticketId);
    const vb = await svc.ticketView(b.ticketId);
    expect([va.number, vb.number]).toEqual([1, 2]);
    expect(vb.ahead).toBe(1);
    expect(vb.etaMin).toBe(10);
  });

  it("رمز خاطئ يُرفض، وبعد 5 محاولات ينتهي", async () => {
    const phone = newPhone();
    await svc.requestCode(shop.slug, { name: "علي", phone });
    for (let i = 0; i < 5; i++) {
      await expect(svc.takeTicket(shop.slug, { name: "علي", phone, code: "000000" })).rejects.toThrow("invalid_code");
    }
    await expect(svc.takeTicket(shop.slug, { name: "علي", phone, code: "000000" })).rejects.toThrow("code_expired");
  });

  it("6) تذكرة واحدة لكلّ هاتف في اليوم: المحاولة الثانية تُرجع نفس التذكرة", async () => {
    const phone = newPhone();
    const a = await take("سليم", phone);
    const b = await take("سليم مرّة ثانية", phone);
    expect(b.ticketId).toBe(a.ticketId);
    expect(b.existing).toBe(true);
    // حتى بعد الإلغاء لا تُعطى تذكرة جديدة في نفس اليوم
    await svc.ticketAction(a.ticketId, { action: "cancel" });
    expect((await take("سليم", phone)).ticketId).toBe(a.ticketId);
    // في يوم آخر: تذكرة جديدة
    advance(24 * 60);
    expect((await take("سليم", phone)).ticketId).not.toBe(a.ticketId);
  });

  it("6) حدّ طلب الرموز: 3 كلّ نصف ساعة لكلّ رقم", async () => {
    const phone = newPhone();
    for (let i = 0; i < 3; i++) await svc.requestCode(shop.slug, { name: "x x", phone });
    await expect(svc.requestCode(shop.slug, { name: "x x", phone })).rejects.toThrow("too_many_codes");
  });

  it("6) لا تذاكر خارج ساعات العمل ولا حين يُغلق الطابور", async () => {
    clock = new Date("2026-10-11T16:00:00Z"); // 17:00 محلّياً
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).rejects.toThrow("outside_hours");
    clock = new Date("2026-10-16T09:00:00Z"); // جمعة
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).rejects.toThrow("outside_hours");
    clock = new Date("2026-10-11T08:00:00Z");
    await act({ action: "close" });
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).rejects.toThrow("queue_closed");
    await act({ action: "open" });
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).resolves.toBeTruthy();
  });

  it("رقم هاتف غير صحيح يُرفض", async () => {
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: "12345" })).rejects.toThrow("invalid_phone");
  });

  it("انتهاء الاشتراك يوقف الأرقام الجديدة", async () => {
    advance(61 * 24 * 60);
    await expect(svc.requestCode(shop.slug, { name: "x x", phone: newPhone() })).rejects.toThrow("subscription");
  });
});

describe("يوم عمل كامل", () => {
  it("التالي، الوقت المتوقَّع من متوسّط اليوم، و«تعال الآن»", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await take(`زبون ${i + 1}`)).ticketId);
    sent.length = 0;

    await next(); // ينادي 1
    expect(sentTypes()).toContain("1:called");
    // أمام 5: الحالي + 2,3,4 = 4 ← لا شيء بعد؛ أمام 6 = 5 ← سؤال التأكيد
    expect(sentTypes()).toContain("6:confirm");
    // أمام 4 = 3 ← «تعال الآن»
    expect(sentTypes()).toContain("4:soon");
    expect(sentTypes()).not.toContain("5:soon");
    // الجميع يؤكّد قدومه (وإلّا يُؤجَّل بعد 10 دقائق — انظر قواعد الغياب)
    for (const id of ids) {
      const v = await svc.ticketView(id);
      if (v.askConfirm) await svc.ticketAction(id, { action: "confirm" });
    }
    await act({ action: "arrived", ticketId: ids[0] });

    advance(6);
    await next(); // انتهى 1 بعد 6 دقائق
    advance(4);
    await next(); // انتهى 2 بعد 4 دقائق
    const v8 = await svc.ticketView(ids[7]);
    expect(v8.currentNumber).toBe(3);
    expect(v8.ahead).toBe(5); // 3 (الحالي) + 4,5,6,7
    // المتوسّط = (6 + 4 + 10) / 3 ≈ 6.67 ← الحالي 6.67 + 4×6.67 ≈ 33.3
    expect(v8.etaMin).toBe(34);

    const st = await state();
    expect(st.stats.served).toBe(2);
    expect(st.current?.number).toBe(3);
    expect(st.waiting.map((w) => w.number)).toEqual([4, 5, 6, 7, 8]);
  });

  it("الضغط المزدوج على «التالي» لا يتخطّى أحداً", async () => {
    for (let i = 0; i < 3; i++) await take();
    await next();
    const s = await state();
    await act({ action: "next", current: s.current!.id });
    await expect(act({ action: "next", current: s.current!.id })).rejects.toThrow("conflict");
    expect((await state()).current?.number).toBe(2);
  });

  it("طلبات متزامنة: أرقام فريدة متسلسلة، و«التالي» المزدوج ينجح مرّة واحدة", async () => {
    const people = Array.from({ length: 8 }, () => ({ name: "متزامن", phone: newPhone() }));
    const codes = await Promise.all(people.map((p) => svc.requestCode(shop.slug, p)));
    const res = await Promise.all(
      people.map((p, i) => svc.takeTicket(shop.slug, { ...p, code: codes[i].devCode })),
    );
    const numbers = await Promise.all(res.map(async (r) => (await svc.ticketView(r.ticketId)).number));
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    await next();
    const s = await state();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => act({ action: "next", current: s.current!.id })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await state()).current?.number).toBe(2);
  });

  it("إضافة يدوية لشخص بلا هاتف ذكي", async () => {
    await take();
    const r = await act({ action: "add", name: "الحاج محمد", present: true });
    expect(r.number).toBe(2);
    const st = await state();
    const w = st.waiting.find((x) => x.number === 2)!;
    expect(w.source).toBe("desk");
    expect(w.arrived).toBe(true);
    expect(w.phone).toBe("");
  });
});

describe("قواعد الغياب", () => {
  it("1) لا ردّ خلال 10 دقائق ← يُؤجَّل ويُتخطّى؛ حين يؤكّد يستعيد مكانه", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push((await take()).ticketId);
    await next(); // 1 الحالي؛ أمام 6 = 5
    let v6 = await svc.ticketView(ids[5]);
    expect(v6.askConfirm).toBe(true);
    await act({ action: "arrived", ticketId: ids[0] });
    for (const id of ids.slice(1, 5)) await svc.ticketAction(id, { action: "confirm" });

    advance(10);
    v6 = await svc.ticketView(ids[5]);
    expect(v6.held).toBe(true);
    expect(sentTypes()).toContain("6:held");
    // 7 لم يعد خلفه في العدّ
    expect((await svc.ticketView(ids[6])).ahead).toBe(5);

    // ينادى 2,3,4,5 ثمّ يُتخطّى 6 إلى 7
    for (let i = 0; i < 4; i++) {
      await act({ action: "arrived", ticketId: (await state()).current!.id });
      await next();
    }
    expect((await state()).current?.number).toBe(5);
    await next();
    expect((await state()).current?.number).toBe(7);

    // 6 يؤكّد ← يدخل بعد الحالي مباشرة
    const back = await svc.ticketAction(ids[5], { action: "confirm" });
    expect(back.held).toBe(false);
    expect(back.ahead).toBe(1);
  });

  it("2) «وصلت» يحتاج رمز الباب الصحيح", async () => {
    const { ticketId } = await take();
    await expect(svc.ticketAction(ticketId, { action: "checkin", door: "wrong" })).rejects.toThrow("bad_door_code");
    const v = await svc.ticketAction(ticketId, { action: "checkin", door: shop.doorCode });
    expect(v.arrived).toBe(true);
    expect((await state()).waiting[0].arrived).toBe(true);
  });

  it("أخذ الرقم من رمز الباب يسجّل الوصول مباشرة", async () => {
    const { ticketId } = await take("حاضر", newPhone(), shop.doorCode);
    expect((await svc.ticketView(ticketId)).arrived).toBe(true);
  });

  it("3) نودي ولم يحضر ← يمرّ الدور تلقائياً؛ يعود خلال 15 دقيقة فيدخل بعد الحالي", async () => {
    const a = await take("غائب");
    const b = await take("حاضر 1", newPhone(), shop.doorCode);
    await take("حاضر 2", newPhone(), shop.doorCode);
    await next(); // ينادي الغائب
    advance(5); // مهلة التخطّي
    const st = await state();
    expect(st.current?.number).toBe(2);
    expect(st.deferred.map((d) => d.number)).toEqual([1]);
    expect(st.deferred[0].minutesLeft).toBe(15);
    expect(sentTypes()).toEqual(expect.arrayContaining(["1:missed", "2:called"]));

    advance(10);
    const v = await svc.ticketAction(a.ticketId, { action: "checkin", door: shop.doorCode });
    expect(v.status).toBe("waiting");
    expect(v.ahead).toBe(1); // بعد الحالي (2) وقبل 3
    await next();
    expect((await state()).current?.number).toBe(1);
    expect(b).toBeTruthy();
  });

  it("3) المؤجَّل بعد 15 دقيقة تنتهي تذكرته ويُسجَّل غياباً", async () => {
    const a = await take("غائب");
    await take("آخر", newPhone(), shop.doorCode);
    await next();
    await next("no_show_next"); // 4) زرّ «لم يحضر — التالي»
    advance(15);
    const v = await svc.ticketView(a.ticketId);
    expect(v.status).toBe("no_show");
    await expect(svc.ticketAction(a.ticketId, { action: "checkin", door: shop.doorCode })).rejects.toThrow();
    const rows = await db.query<{ n: number }>("select count(*)::int n from no_shows where shop_id = $1", [shop.id]);
    expect(rows[0].n).toBe(1);
  });

  it("5) بعد غيابين تحتاج التذكرة موافقة السكرتيرة؛ والسجلّ يُمحى بعد شهرين", async () => {
    const phone = newPhone();
    for (let day = 0; day < 2; day++) {
      const t = await take("كثير الغياب", phone);
      await take("آخر", newPhone(), shop.doorCode);
      await next();
      await next("no_show_next");
      advance(16);
      expect((await svc.ticketView(t.ticketId)).status).toBe("no_show");
      advance(24 * 60 - 16);
    }
    const t3 = await take("كثير الغياب", phone);
    expect((await svc.ticketView(t3.ticketId)).status).toBe("pending_approval");
    let st = await state();
    expect(st.pending[0].noShows).toBe(2);
    // لا يُنادى قبل الموافقة
    await next();
    expect((await state()).current).toBeNull();
    await act({ action: "approve", ticketId: t3.ticketId });
    expect((await svc.ticketView(t3.ticketId)).status).toBe("waiting");
    expect(sentTypes()).toContain(`${(await svc.ticketView(t3.ticketId)).number}:approved`);

    // بعد شهرين: يُمحى السجلّ
    advance(61 * 24 * 60);
    const r = await svc.runCron();
    expect(r.noShows).toBeGreaterThanOrEqual(2);
    st = await state();
    expect(st.pending).toHaveLength(0);
  });

  it("نهاية اليوم: تُغلق تذاكر الأمس المفتوحة", async () => {
    const a = await take();
    advance(24 * 60);
    await state(); // تشغيل التنظيف
    expect((await svc.ticketView(a.ticketId)).status).toBe("expired");
  });
});

describe("الإعدادات", () => {
  it("يرفض القيم غير المنطقية", async () => {
    await expect(svc.updateSettings(shop, { settings: { notifyAhead: 9, confirmAhead: 5 } })).rejects.toThrow(
      "invalid_settings",
    );
    await expect(svc.updateSettings(shop, { hours: { "0": [["10:00", "09:00"]] } })).rejects.toThrow(
      "invalid_settings",
    );
    const s = await svc.updateSettings(shop, { settings: { callGraceMin: 0 }, hours: { "0": [] } });
    expect(s.settings.callGraceMin).toBe(0);
    expect(s.hours["0"]).toEqual([]);
  });
});
