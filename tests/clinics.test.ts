/**
 * عيادات بعدّة أطبّاء + أدوار الطبيب/السكرتيرة (PGlite أو Postgres حقيقي عبر TEST_DATABASE_URL).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// كوكيز وهمية لاختبار staffAccess/requireOwner دون خادم Next
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { setNotifier } from "@/lib/server/notify";
import * as svc from "@/lib/server/service";
import * as clinics from "@/lib/server/clinics";
import * as repo from "@/lib/server/repo";
import { clinicCookieName, readSession, sessionCookieName } from "@/lib/server/auth";
import { requireOwner, requireStaff, staffAccess } from "@/lib/server/http";
import { DomainError, type Shop } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z"); // الأحد 08:00 بالجزائر

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
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
  setNotifier({ send: async () => {} });
});

afterAll(async () => {
  setDb(undefined);
  setClock(undefined);
  setNotifier(undefined);
  await db.close();
});

let n = 0;
let shop: Shop;
beforeEach(async () => {
  clock = new Date("2026-10-11T07:00:00Z");
  jar.clear();
  shop = await svc.createShop({ name: "عيادة", slug: `doc-${++n}`, kind: "doctor", pin: "4321", email: "dr@example.com" });
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return "ok";
}

const fresh = async (s: Shop) => (await repo.getShopById(db, s.id))!;
const login = async (slug: string, pin: string) => {
  const r = await svc.staffLogin(slug, pin);
  jar.set(sessionCookieName(r.shop.id), r.token);
  return r;
};

describe("أدوار الطبيب والسكرتيرة", () => {
  it("رمز الطبيب ← owner، رمز السكرتيرة ← assistant، غيرهما مرفوض", async () => {
    await clinics.setAssistantPin(shop, "1111");
    const o = await svc.staffLogin(shop.slug, "4321");
    expect(o.role).toBe("owner");
    expect(readSession(o.token, clock)?.r).toBe("o");
    const a = await svc.staffLogin(shop.slug, "1111");
    expect(a.role).toBe("assistant");
    expect(readSession(a.token, clock)?.r).toBe("a");
    expect(await code(svc.staffLogin(shop.slug, "9999"))).toBe("wrong_pin");
  });

  it("مصفوفة الصلاحيات: السكرتيرة تدير الطابور ولا تفتح الإعدادات/الاشتراك", async () => {
    await clinics.setAssistantPin(shop, "1111");
    await login(shop.slug, "1111");
    expect((await staffAccess(shop.slug))?.role).toBe("assistant");
    expect((await requireStaff(shop.slug)).id).toBe(shop.id);
    expect(await code(requireOwner(shop.slug))).toBe("forbidden");
    // تشغيل الطابور مسموح
    const s = await requireStaff(shop.slug);
    await svc.staffAction(s, { action: "add", name: "مريض", phone: "0550000001" });
    expect((await svc.staffState(s)).waiting.length).toBe(1);

    jar.clear();
    expect(await code(requireStaff(shop.slug))).toBe("unauthorized");
    await login(shop.slug, "4321");
    expect((await requireOwner(shop.slug)).id).toBe(shop.id);
  });

  it("الجلسات القديمة بلا r تُعامَل كصاحب العيادة", async () => {
    const { signSession } = await import("@/lib/server/auth");
    jar.set(sessionCookieName(shop.id), signSession({ shopId: shop.id, v: shop.sessionVersion, exp: clock.getTime() + 1e6 }));
    expect((await staffAccess(shop.slug))?.role).toBe("owner");
  });

  it("تغيير رمز السكرتيرة يُخرج السكرتيرة فقط، وحذفه يمنع دخولها", async () => {
    await clinics.setAssistantPin(shop, "1111");
    const a = await svc.staffLogin(shop.slug, "1111");
    const o = await svc.staffLogin(shop.slug, "4321");
    await clinics.setAssistantPin(await fresh(shop), "2222");
    jar.set(sessionCookieName(shop.id), a.token);
    expect(await staffAccess(shop.slug)).toBeNull();
    jar.set(sessionCookieName(shop.id), o.token);
    expect((await staffAccess(shop.slug))?.role).toBe("owner");
    expect((await svc.staffLogin(shop.slug, "2222")).role).toBe("assistant");
    await clinics.setAssistantPin(await fresh(shop), null);
    expect(await code(svc.staffLogin(shop.slug, "2222"))).toBe("wrong_pin");
  });

  it("تغيير رمز الطبيب يُخرج الطبيب ولا يمسّ السكرتيرة؛ ولا يساوي رمز السكرتيرة", async () => {
    await clinics.setAssistantPin(shop, "1111");
    const a = await svc.staffLogin(shop.slug, "1111");
    const o = await svc.staffLogin(shop.slug, "4321");
    expect(await code(svc.updateSettings(await fresh(shop), { newPin: "1111" }))).toBe("assistant_same_pin");
    expect(await code(clinics.setAssistantPin(await fresh(shop), "4321"))).toBe("assistant_same_pin");
    await svc.updateSettings(await fresh(shop), { newPin: "5555" });
    jar.set(sessionCookieName(shop.id), o.token);
    expect(await staffAccess(shop.slug)).toBeNull();
    jar.set(sessionCookieName(shop.id), a.token);
    expect((await staffAccess(shop.slug))?.role).toBe("assistant");
  });

  it("رمز السكرتيرة يتقاسم عدّاد القفل", async () => {
    await clinics.setAssistantPin(shop, "1111");
    for (let i = 0; i < 5; i++) expect(await code(svc.staffLogin(shop.slug, "0000"))).toBe("wrong_pin");
    expect(await code(svc.staffLogin(shop.slug, "1111"))).toBe("locked");
  });
});

describe("العيادات بعدّة أطبّاء", () => {
  let c = 0;
  const make = async () =>
    clinics.createClinic({
      name: "مركز النور",
      slug: `center-${++c}`,
      email: "Boss@Example.com",
      pin: "7777",
      doctor: { doctorName: "أمينة", specialty: "أطفال", room: "مكتب 1", slug: `center-${c}-a`, pin: "1234" },
    });

  it("الإنشاء: عيادة + طبيبها الأوّل مع اللون والبريد الموروثين", async () => {
    const { clinic, shop: first } = await make();
    expect(clinic.ownerEmail).toBe("boss@example.com");
    expect(first.clinicId).toBe(clinic.id);
    expect(first.room).toBe("مكتب 1");
    expect(first.profile.specialty).toBe("أطفال");
    expect(first.ownerEmail).toBe("boss@example.com");
    expect(first.trialEndsAt.getTime()).toBeGreaterThan(clock.getTime());
    expect(await code(make().then(() => clinics.createClinic({ name: "x y", slug: `center-${c}`, email: "a@b.co", pin: "1234", doctor: { doctorName: "علي", slug: "zz-new" } })))).toBe("slug_taken");
    expect(await code(clinics.createClinic({ name: "مركز", slug: "bad slug", email: "a@b.co", pin: "1234", doctor: { doctorName: "علي" } }))).toBe("invalid_slug");
  });

  it("رمز التسجيل مطلوب إن ضُبط", async () => {
    process.env.SIGNUP_CODE = "secret";
    try {
      expect(await code(make())).toBe("bad_signup_code");
    } finally {
      delete process.env.SIGNUP_CODE;
    }
  });

  it("إضافة طبيب وضمّ عيادة موجودة (رمز خاطئ مرفوض)، تعديل المكتب والإزالة", async () => {
    const { clinic } = await make();
    const added = await clinics.addDoctor(clinic, { doctorName: "كريم", specialty: "أسنان", kind: "dentist", room: "مكتب 2", slug: `added-${c}`, pin: "2468" });
    expect(added.clinicId).toBe(clinic.id);
    expect(added.kind).toBe("dentist");
    expect(await code(clinics.joinDoctor(clinic, { slug: shop.slug, pin: "0000" }))).toBe("wrong_pin");
    // رمز السكرتيرة لا يكفي للضمّ
    await clinics.setAssistantPin(shop, "1111");
    expect(await code(clinics.joinDoctor(clinic, { slug: shop.slug, pin: "1111" }))).toBe("wrong_pin");
    const joined = await clinics.joinDoctor(clinic, { slug: shop.slug, pin: "4321", room: "مكتب 3" });
    expect(joined.clinicId).toBe(clinic.id);
    // عيادة أخرى لا تستطيع خطفه
    const other = (await make()).clinic;
    expect(await code(clinics.joinDoctor(other, { slug: shop.slug, pin: "4321" }))).toBe("already_in_clinic");
    expect(await code(clinics.setDoctorRoom(other, shop.slug, "x"))).toBe("shop_not_found");
    await clinics.setDoctorRoom(clinic, shop.slug, "مكتب 9");
    expect((await fresh(shop)).room).toBe("مكتب 9");
    await clinics.removeDoctor(clinic, shop.slug);
    expect((await fresh(shop)).clinicId).toBeNull();
    expect(await code(clinics.removeDoctor(clinic, shop.slug))).toBe("shop_not_found");
  });

  it("المدير يملك صلاحيات الطبيب على أعضاء عيادته فقط", async () => {
    const { clinic, shop: member } = await make();
    const { token } = await clinics.clinicLogin(clinic.slug, "7777");
    jar.set(clinicCookieName(clinic.id), token);
    expect((await staffAccess(member.slug))?.role).toBe("manager");
    expect((await requireOwner(member.slug)).id).toBe(member.id);
    expect(await code(requireStaff(shop.slug))).toBe("unauthorized"); // ليس عضواً
    // بعد الإزالة تسقط الصلاحية
    await clinics.removeDoctor(clinic, member.slug);
    expect(await staffAccess(member.slug)).toBeNull();
    // جلسة عيادة أخرى لا تفتح شيئاً
    await clinics.joinDoctor(clinic, { slug: member.slug, pin: "1234" });
    const other = (await make()).clinic;
    jar.clear();
    jar.set(clinicCookieName(clinic.id), (await clinics.clinicLogin(other.slug, "7777")).token);
    expect(await staffAccess(member.slug)).toBeNull();
  });

  it("تغيير رمز المدير يُبطل جلساته القديمة", async () => {
    const { clinic, shop: member } = await make();
    jar.set(clinicCookieName(clinic.id), (await clinics.clinicLogin(clinic.slug, "7777")).token);
    await clinics.changeClinicPin(clinic, "8888");
    expect(await staffAccess(member.slug)).toBeNull();
  });

  it("قفل دخول المدير بعد 5 محاولات خاطئة، ثمّ يُفتح بعد 15 دقيقة", async () => {
    const { clinic } = await make();
    for (let i = 0; i < 5; i++) expect(await code(clinics.clinicLogin(clinic.slug, "0000"))).toBe("wrong_pin");
    expect(await code(clinics.clinicLogin(clinic.slug, "7777"))).toBe("locked");
    clock = new Date(clock.getTime() + 16 * 60000);
    expect((await clinics.clinicLogin(clinic.slug, "7777")).clinic.id).toBe(clinic.id);
  });

  it("الواجهة العامّة: أرقام وأعداد فقط — لا أسماء ولا هواتف", async () => {
    const { clinic, shop: member } = await make();
    const m = await fresh(member);
    await svc.staffAction(m, { action: "add", name: "سرّي جدّاً", phone: "0550001234" });
    await svc.staffAction(m, { action: "add", name: "آخر", phone: "0550001235" });
    await svc.staffAction(m, { action: "next" });
    const pub = await clinics.clinicPublic(clinic.slug);
    const text = JSON.stringify(pub);
    expect(text).not.toContain("سرّي");
    expect(text).not.toContain("0550001234");
    expect(text).not.toContain("55 00 12");
    expect(text).not.toContain("pin");
    expect(text).not.toContain("boss@");
    expect(pub.doctors).toHaveLength(1);
    expect(pub.doctors[0].currentNumber).toBe(1);
    expect(pub.doctors[0].nextNumbers).toEqual([2]);
    expect(pub.doctors[0].waiting).toBe(1);
    expect(await code(clinics.clinicPublic("nope-nope"))).toBe("clinic_not_found");

    const mv = await clinics.managerView(clinic);
    expect(mv.doctors[0].subscription.active).toBe(true);
    expect(JSON.stringify(mv)).not.toContain("0550001234");
  });

  it("اشتراك منتهٍ يظهر «inactive»", async () => {
    const { clinic } = await make();
    clock = new Date(clock.getTime() + 400 * 86400_000);
    const pub = await clinics.clinicPublic(clinic.slug);
    expect(pub.doctors[0].status).toBe("inactive");
  });
});
